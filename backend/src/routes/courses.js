import crypto from "crypto";
import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { hasScheduleConflict, parseScheduleBlock } from "../utils/schedule.js";
import {
  createNotification,
  evaluateRegistration,
  getActiveSemester,
  getCurrentPhase,
  getRegistrationFrozen,
  getSystemSettingNumber,
  logEnrollmentHistory,
  parsePrerequisites,
  processWaitlistForCourse,
  releaseExpiredSeatHolds
} from "../utils/registration.js";
import { sendRegistrationEmail } from "../services/email.js";

const router = Router();

const toCourseResponse = (row) => ({
  id: row.id,
  code: row.code,
  courseGroup: row.course_group,
  section: row.section_label,
  title: row.title,
  description: row.description,
  credits: Number(row.credits),
  isCore: Boolean(row.is_core),
  seatsTotal: Number(row.seats_total),
  seatsAvailable: Number(row.seats_available),
  waitlistCapacity: Number(row.waitlist_capacity),
  scheduleBlock: row.schedule_block,
  department: row.department_name || row.department || "General",
  semester: row.semester_name ? `${row.semester_name} ${row.academic_year}` : null,
  faculty: row.faculty_name || null,
  prerequisites: parsePrerequisites(row.prerequisites),
  minYearLevel: Number(row.min_year_level || 1),
  minCgpa: Number(row.min_cgpa || 0),
  registrationStatus: row.registration_status || "not_registered",
  activeEnrollmentCount: Number(row.active_enrollment_count || 0),
  averageRating: Number(row.average_rating || 0)
});

const requireStudent = (req, res) => {
  if (req.user.role !== "student") {
    res.status(403).json({ error: "This action is available only for students." });
    return false;
  }
  return true;
};

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const search = String(req.query.q || "").trim();
    const departmentId = Number(req.query.departmentId) || null;
    const semesterId = Number(req.query.semesterId) || null;
    const credits = Number(req.query.credits) || null;

    const params = [req.user.id];
    const filters = [];

    if (search) {
      filters.push("(c.code LIKE ? OR c.title LIKE ? OR c.description LIKE ?)");
      const wildcard = `%${search}%`;
      params.push(wildcard, wildcard, wildcard);
    }

    if (departmentId) {
      filters.push("c.department_id = ?");
      params.push(departmentId);
    }

    if (semesterId) {
      filters.push("c.semester_id = ?");
      params.push(semesterId);
    }

    if (credits) {
      filters.push("c.credits = ?");
      params.push(credits);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.course_group, c.section_label, c.title, c.description,
              c.credits, c.is_core, c.seats_total, c.seats_available, c.waitlist_capacity,
              c.schedule_block, c.prerequisites, c.department, c.min_year_level, c.min_cgpa,
              d.name AS department_name,
              s.name AS semester_name, s.academic_year,
              faculty.full_name AS faculty_name,
              COALESCE(e.status, 'not_registered') AS registration_status,
              COALESCE(COUNT(DISTINCT ea.id), 0) AS active_enrollment_count,
              COALESCE(ROUND(AVG(cr.rating), 2), 0) AS average_rating
       FROM courses c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN semesters s ON s.id = c.semester_id
       LEFT JOIN users faculty ON faculty.id = c.faculty_id
       LEFT JOIN enrollments e
         ON e.course_id = c.id
        AND e.student_id = ?
        AND e.status IN ('registered', 'approved', 'pending', 'waitlisted')
       LEFT JOIN enrollments ea
         ON ea.course_id = c.id
        AND ea.status IN ('registered', 'approved', 'pending')
       LEFT JOIN course_reviews cr ON cr.course_id = c.id
       ${whereClause}
       GROUP BY c.id, e.status, d.name, s.name, s.academic_year, faculty.full_name
       ORDER BY c.course_group ASC, c.section_label ASC`,
      params
    );

    return res.json({
      courses: rows.map(toCourseResponse)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/meta", async (_req, res, next) => {
  try {
    const [departments] = await pool.query(
      "SELECT id, code, name FROM departments ORDER BY name ASC"
    );
    const [semesters] = await pool.query(
      `SELECT id, name, academic_year, starts_on, ends_on, is_active
       FROM semesters
       ORDER BY starts_on DESC`
    );

    return res.json({ departments, semesters });
  } catch (error) {
    return next(error);
  }
});

router.get("/registration-window", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const semester = await getActiveSemester(connection);
    if (!semester) {
      return res.status(404).json({ error: "No semester configuration found." });
    }

    const phaseInfo = await getCurrentPhase(connection, semester.id);
    const [phases] = await connection.query(
      `SELECT id, phase_name, starts_at, ends_at, min_year_level, min_cgpa
       FROM registration_phases
       WHERE semester_id = ?
       ORDER BY starts_at ASC`,
      [semester.id]
    );

    const registrationFrozen = await getRegistrationFrozen(connection);

    const now = Date.now();
    const activePhase = phaseInfo.phase;
    const countdownSeconds = activePhase
      ? Math.max(0, Math.floor((new Date(activePhase.ends_at).getTime() - now) / 1000))
      : 0;

    const addDropCountdownSeconds = Math.max(
      0,
      Math.floor((new Date(semester.add_drop_ends_at).getTime() - now) / 1000)
    );

    return res.json({
      semester,
      phaseState: phaseInfo.state,
      activePhase,
      phases,
      registrationFrozen,
      countdownSeconds,
      addDropCountdownSeconds
    });
  } catch (error) {
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/my", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  try {
    const [enrollments] = await pool.query(
      `SELECT e.id AS application_id, e.status, e.source, e.enrolled_at, e.updated_at,
              c.id AS course_id, c.code, c.course_group, c.section_label, c.title,
              c.credits, c.schedule_block,
              s.name AS semester_name, s.academic_year,
              w.position_no AS waitlist_position
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN semesters s ON s.id = e.semester_id
       LEFT JOIN waitlist_entries w
              ON w.course_id = e.course_id
             AND w.student_id = e.student_id
             AND w.status = 'active'
       WHERE e.student_id = ?
       ORDER BY e.updated_at DESC`,
      [req.user.id]
    );

    const [[creditsRow]] = await pool.query(
      `SELECT COALESCE(SUM(c.credits), 0) AS total
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = ?
         AND e.status IN ('registered', 'approved', 'pending')`,
      [req.user.id]
    );

    const [[waitlistCountRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM waitlist_entries
       WHERE student_id = ?
         AND status = 'active'`,
      [req.user.id]
    );

    const [[userRow]] = await pool.query(
      `SELECT max_credits, financial_hold, year_level, cgpa
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    const [history] = await pool.query(
      `SELECT h.id, h.action_type, h.note, h.created_at,
              c.code, c.title
       FROM enrollment_history h
       JOIN courses c ON c.id = h.course_id
       WHERE h.student_id = ?
       ORDER BY h.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    return res.json({
      enrollments,
      summary: {
        activeCredits: Number(creditsRow.total),
        maxCredits: Number(userRow?.max_credits || 24),
        financialHold: Boolean(userRow?.financial_hold),
        yearLevel: Number(userRow?.year_level || 1),
        cgpa: Number(userRow?.cgpa || 0),
        activeWaitlistCount: Number(waitlistCountRow.total)
      },
      history
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/preview", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const numericCourseId = Number(req.body.courseId);
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) {
    return res.status(400).json({ error: "Valid courseId is required." });
  }

  const connection = await pool.getConnection();
  try {
    await releaseExpiredSeatHolds(connection);

    const evaluation = await evaluateRegistration(connection, {
      studentId: req.user.id,
      courseId: numericCourseId,
      mode: "register"
    });

    const [existingRows] = await connection.query(
      `SELECT status
       FROM enrollments
       WHERE student_id = ?
         AND course_id = ?
       LIMIT 1`,
      [req.user.id, numericCourseId]
    );

    const existing = existingRows[0];
    if (
      existing &&
      ["registered", "approved", "pending", "waitlisted"].includes(existing.status)
    ) {
      evaluation.reasons.push(`Current enrollment status is '${existing.status}'.`);
      evaluation.ok = false;
    }

    let estimatedStatus = "registered";
    let estimatedWaitlistPosition = null;

    if (Number(evaluation.course?.seats_available || 0) <= 0) {
      estimatedStatus = "waitlisted";
      const [[waitlistRow]] = await connection.query(
        `SELECT COALESCE(MAX(position_no), 0) + 1 AS position_no
         FROM waitlist_entries
         WHERE course_id = ?
           AND status = 'active'`,
        [numericCourseId]
      );
      estimatedWaitlistPosition = Number(waitlistRow.position_no);
    }

    await logEnrollmentHistory(connection, {
      studentId: req.user.id,
      courseId: numericCourseId,
      actionType: "preview",
      note: evaluation.ok ? "Registration preview valid." : evaluation.reasons.join(" ")
    });

    return res.json({
      eligible: evaluation.ok,
      estimatedStatus,
      estimatedWaitlistPosition,
      reasons: evaluation.reasons,
      projectedCredits: evaluation.projectedCredits,
      activeCredits: evaluation.activeCredits,
      missingPrerequisites: evaluation.missingPrerequisites,
      conflicts: evaluation.conflicts,
      phase: evaluation.phase,
      overloadApproved: evaluation.overloadApproved,
      prerequisiteOverrideApproved: evaluation.prerequisiteOverrideApproved,
      course: evaluation.course
    });
  } catch (error) {
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/hold", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const numericCourseId = Number(req.body.courseId);
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) {
    return res.status(400).json({ error: "Valid courseId is required." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await releaseExpiredSeatHolds(connection);

    const evaluation = await evaluateRegistration(connection, {
      studentId: req.user.id,
      courseId: numericCourseId,
      mode: "register"
    });

    if (!evaluation.ok) {
      await connection.rollback();
      return res.status(409).json({
        error: "Course is not eligible for hold.",
        details: evaluation.reasons
      });
    }

    const [existingHoldRows] = await connection.query(
      `SELECT hold_reference, expires_at
       FROM seat_holds
       WHERE student_id = ?
         AND course_id = ?
         AND status = 'active'
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [req.user.id, numericCourseId]
    );

    const existingHold = existingHoldRows[0];
    if (existingHold) {
      await connection.commit();
      return res.json({
        holdReference: existingHold.hold_reference,
        expiresAt: existingHold.expires_at,
        message: "Active hold already exists for this course."
      });
    }

    const [[course]] = await connection.query(
      `SELECT id, code, title, seats_available
       FROM courses
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [numericCourseId]
    );

    if (!course) {
      await connection.rollback();
      return res.status(404).json({ error: "Course not found." });
    }

    if (Number(course.seats_available) <= 0) {
      await connection.rollback();
      return res.status(409).json({ error: "No seats available to hold." });
    }

    const holdMinutes = await getSystemSettingNumber(
      connection,
      "seat_hold_minutes",
      5
    );
    const holdReference = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + holdMinutes);

    await connection.query(
      `INSERT INTO seat_holds
       (hold_reference, student_id, course_id, status, expires_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [holdReference, req.user.id, numericCourseId, expiresAt]
    );

    await connection.query(
      `UPDATE courses
       SET seats_available = GREATEST(0, seats_available - 1)
       WHERE id = ?`,
      [numericCourseId]
    );

    await logEnrollmentHistory(connection, {
      studentId: req.user.id,
      courseId: numericCourseId,
      actionType: "hold",
      note: `Temporary hold placed until ${expiresAt.toISOString()}`
    });

    await connection.commit();

    return res.status(201).json({
      holdReference,
      expiresAt,
      message: `${course.code} seat is held for ${holdMinutes} minutes.`
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/register", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const numericCourseId = Number(req.body.courseId);
  const holdReference = req.body.holdReference
    ? String(req.body.holdReference).trim()
    : null;

  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) {
    return res.status(400).json({ error: "Valid courseId is required." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await releaseExpiredSeatHolds(connection);

    const evaluation = await evaluateRegistration(connection, {
      studentId: req.user.id,
      courseId: numericCourseId,
      mode: "register"
    });

    if (!evaluation.course) {
      await connection.rollback();
      return res.status(404).json({ error: "Course not found." });
    }

    const [existingRows] = await connection.query(
      `SELECT id, status
       FROM enrollments
       WHERE student_id = ?
         AND course_id = ?
       LIMIT 1
       FOR UPDATE`,
      [req.user.id, numericCourseId]
    );

    const existing = existingRows[0];
    if (
      existing &&
      ["registered", "approved", "pending", "waitlisted"].includes(existing.status)
    ) {
      await connection.rollback();
      return res.status(409).json({
        error: `You already have an active enrollment status: ${existing.status}.`
      });
    }

    let activeHold = null;
    if (holdReference) {
      const [holdRows] = await connection.query(
        `SELECT id, hold_reference, status, expires_at
         FROM seat_holds
         WHERE hold_reference = ?
           AND student_id = ?
           AND course_id = ?
           AND status = 'active'
           AND expires_at > NOW()
         LIMIT 1
         FOR UPDATE`,
        [holdReference, req.user.id, numericCourseId]
      );
      activeHold = holdRows[0] || null;

      if (!activeHold) {
        await connection.rollback();
        return res.status(409).json({ error: "Invalid or expired seat hold reference." });
      }
    }

    const [[courseForUpdate]] = await connection.query(
      `SELECT id, code, title, seats_available, waitlist_capacity, semester_id
       FROM courses
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [numericCourseId]
    );

    if (!courseForUpdate) {
      await connection.rollback();
      return res.status(404).json({ error: "Course not found." });
    }

    if (!evaluation.ok) {
      await connection.rollback();
      return res.status(409).json({
        error: "Registration validation failed.",
        details: evaluation.reasons,
        missingPrerequisites: evaluation.missingPrerequisites,
        conflictWith: evaluation.conflicts
      });
    }

    const canDirectRegister = activeHold || Number(courseForUpdate.seats_available) > 0;

    if (canDirectRegister) {
      const [result] = await connection.query(
       `INSERT INTO enrollments (student_id, course_id, semester_id, status, source)
         VALUES (?, ?, ?, 'registered', ?)
         ON DUPLICATE KEY UPDATE
           status = 'registered',
           source = VALUES(source),
           semester_id = VALUES(semester_id),
           updated_at = CURRENT_TIMESTAMP`,
        [
          req.user.id,
          numericCourseId,
          courseForUpdate.semester_id,
          "direct"
        ]
      );

      if (activeHold) {
        await connection.query(
          `UPDATE seat_holds
           SET status = 'converted'
           WHERE id = ?`,
          [activeHold.id]
        );
      } else {
        await connection.query(
          `UPDATE courses
           SET seats_available = GREATEST(0, seats_available - 1)
           WHERE id = ?`,
          [numericCourseId]
        );
      }

      await connection.query(
        `UPDATE waitlist_entries
         SET status = 'cancelled'
         WHERE course_id = ? AND student_id = ? AND status = 'active'`,
        [numericCourseId, req.user.id]
      );

      await logEnrollmentHistory(connection, {
        enrollmentId: result.insertId || null,
        studentId: req.user.id,
        courseId: numericCourseId,
        actionType: "register",
        note: holdReference
          ? "Registered using temporary seat hold."
          : "Direct registration completed."
      });

      await createNotification(
        connection,
        req.user.id,
        "registration_confirmation",
        `Registration confirmed: ${courseForUpdate.code} (${courseForUpdate.title}).`,
        { courseId: numericCourseId }
      );

      await connection.commit();

      await sendRegistrationEmail({
        userId: req.user.id,
        courseCode: courseForUpdate.code,
        courseTitle: courseForUpdate.title,
        semesterLabel:
          evaluation.course?.semester_name && evaluation.course?.academic_year
            ? `${evaluation.course.semester_name} ${evaluation.course.academic_year}`
            : null,
        status: "registered"
      }).catch(() => null);

      return res.status(201).json({
        message: "Registration completed.",
        status: "registered",
        projectedCredits: evaluation.projectedCredits,
        course: {
          id: numericCourseId,
          code: courseForUpdate.code,
          title: courseForUpdate.title
        }
      });
    }

    const [[waitlistSizeRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM waitlist_entries
       WHERE course_id = ? AND status = 'active'`,
      [numericCourseId]
    );

    if (Number(waitlistSizeRow.total) >= Number(courseForUpdate.waitlist_capacity || 0)) {
      await connection.rollback();
      return res
        .status(409)
        .json({ error: "Waitlist capacity reached for this course section." });
    }

    const [[positionRow]] = await connection.query(
      `SELECT COALESCE(MAX(position_no), 0) + 1 AS next_position
       FROM waitlist_entries
       WHERE course_id = ?
         AND status = 'active'`,
      [numericCourseId]
    );

    const positionNo = Number(positionRow.next_position);

    await connection.query(
      `INSERT INTO waitlist_entries
       (student_id, course_id, semester_id, position_no, status)
       VALUES (?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         status = 'active',
         position_no = VALUES(position_no),
         semester_id = VALUES(semester_id),
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, numericCourseId, courseForUpdate.semester_id, positionNo]
    );

    const [enrollmentResult] = await connection.query(
      `INSERT INTO enrollments (student_id, course_id, semester_id, status, source)
       VALUES (?, ?, ?, 'waitlisted', 'direct')
       ON DUPLICATE KEY UPDATE
         status = 'waitlisted',
         source = 'direct',
         semester_id = VALUES(semester_id),
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, numericCourseId, courseForUpdate.semester_id]
    );

    await logEnrollmentHistory(connection, {
      enrollmentId: enrollmentResult.insertId || null,
      studentId: req.user.id,
      courseId: numericCourseId,
      actionType: "waitlist",
      note: `Added to waitlist at position ${positionNo}.`
    });

    await createNotification(
      connection,
      req.user.id,
      "waitlist_update",
      `No seats left for ${courseForUpdate.code}. You are waitlisted at position ${positionNo}.`,
      { courseId: numericCourseId, positionNo }
    );

    await connection.commit();

    await sendRegistrationEmail({
      userId: req.user.id,
      courseCode: courseForUpdate.code,
      courseTitle: courseForUpdate.title,
      semesterLabel:
        evaluation.course?.semester_name && evaluation.course?.academic_year
          ? `${evaluation.course.semester_name} ${evaluation.course.academic_year}`
          : null,
      status: "waitlisted"
    }).catch(() => null);

    return res.status(201).json({
      message: "Added to waitlist.",
      status: "waitlisted",
      waitlistPosition: positionNo,
      course: {
        id: numericCourseId,
        code: courseForUpdate.code,
        title: courseForUpdate.title
      }
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.delete("/register/:courseId", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const numericCourseId = Number(req.params.courseId);
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) {
    return res.status(400).json({ error: "Invalid course id." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await releaseExpiredSeatHolds(connection);

    const registrationFrozen = await getRegistrationFrozen(connection);
    if (registrationFrozen) {
      await connection.rollback();
      return res.status(403).json({ error: "Registration is frozen by administration." });
    }

    const [enrollmentRows] = await connection.query(
      `SELECT e.id, e.status, c.id AS course_id, c.code, c.title,
              c.add_drop_ends_at, s.add_drop_ends_at AS semester_add_drop_ends_at
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN semesters s ON s.id = c.semester_id
       WHERE e.student_id = ?
         AND e.course_id = ?
         AND e.status IN ('registered', 'approved', 'pending', 'waitlisted')
       LIMIT 1
       FOR UPDATE`,
      [req.user.id, numericCourseId]
    );

    const enrollment = enrollmentRows[0];
    if (!enrollment) {
      await connection.rollback();
      return res.status(404).json({ error: "Enrollment not found." });
    }

    const addDropDeadline = enrollment.add_drop_ends_at || enrollment.semester_add_drop_ends_at;
    if (addDropDeadline && Date.now() > new Date(addDropDeadline).getTime()) {
      await connection.rollback();
      return res
        .status(409)
        .json({ error: "Add/Drop period ended. Registration is locked for this course." });
    }

    await connection.query(
      `UPDATE enrollments
       SET status = 'dropped', source = 'direct'
       WHERE id = ?`,
      [enrollment.id]
    );

    await connection.query(
      `UPDATE waitlist_entries
       SET status = 'cancelled'
       WHERE course_id = ?
         AND student_id = ?
         AND status = 'active'`,
      [numericCourseId, req.user.id]
    );

    if (["registered", "approved", "pending"].includes(enrollment.status)) {
      await connection.query(
        `UPDATE courses
         SET seats_available = LEAST(seats_total, seats_available + 1)
         WHERE id = ?`,
        [numericCourseId]
      );
    }

    await logEnrollmentHistory(connection, {
      enrollmentId: enrollment.id,
      studentId: req.user.id,
      courseId: numericCourseId,
      actionType: "drop",
      note: "Dropped by student during add/drop period."
    });

    await createNotification(
      connection,
      req.user.id,
      "registration_confirmation",
      `Course dropped: ${enrollment.code} (${enrollment.title}).`,
      { courseId: numericCourseId }
    );

    await processWaitlistForCourse(connection, numericCourseId);

    await connection.commit();

    await sendRegistrationEmail({
      userId: req.user.id,
      courseCode: enrollment.code,
      courseTitle: enrollment.title,
      status: "dropped"
    }).catch(() => null);

    return res.json({ message: "Course dropped successfully." });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/switch-section", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const fromCourseId = Number(req.body.fromCourseId);
  const toCourseId = Number(req.body.toCourseId);

  if (
    !Number.isInteger(fromCourseId) ||
    !Number.isInteger(toCourseId) ||
    fromCourseId <= 0 ||
    toCourseId <= 0 ||
    fromCourseId === toCourseId
  ) {
    return res.status(400).json({ error: "Valid fromCourseId and toCourseId are required." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await releaseExpiredSeatHolds(connection);

    const [courseRows] = await connection.query(
      `SELECT id, code, course_group, title, seats_available, semester_id
       FROM courses
       WHERE id IN (?, ?)
       FOR UPDATE`,
      [fromCourseId, toCourseId]
    );

    if (courseRows.length < 2) {
      await connection.rollback();
      return res.status(404).json({ error: "One of the selected sections was not found." });
    }

    const fromCourse = courseRows.find((item) => item.id === fromCourseId);
    const toCourse = courseRows.find((item) => item.id === toCourseId);

    if (fromCourse.course_group !== toCourse.course_group) {
      await connection.rollback();
      return res
        .status(409)
        .json({ error: "Section switching is allowed only within the same course group." });
    }

    const [fromEnrollmentRows] = await connection.query(
      `SELECT id, status
       FROM enrollments
       WHERE student_id = ?
         AND course_id = ?
         AND status IN ('registered', 'approved', 'pending')
       LIMIT 1
       FOR UPDATE`,
      [req.user.id, fromCourseId]
    );

    if (fromEnrollmentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "You are not actively enrolled in the source section." });
    }

    const [targetEnrollmentRows] = await connection.query(
      `SELECT id, status
       FROM enrollments
       WHERE student_id = ?
         AND course_id = ?
         AND status IN ('registered', 'approved', 'pending', 'waitlisted')
       LIMIT 1
       FOR UPDATE`,
      [req.user.id, toCourseId]
    );

    if (targetEnrollmentRows.length > 0) {
      await connection.rollback();
      return res
        .status(409)
        .json({ error: `Target section already has status ${targetEnrollmentRows[0].status}.` });
    }

    const evaluation = await evaluateRegistration(connection, {
      studentId: req.user.id,
      courseId: toCourseId,
      ignoreCourseId: fromCourseId,
      mode: "register"
    });

    if (!evaluation.ok) {
      await connection.rollback();
      return res.status(409).json({
        error: "Cannot switch section due to validation rules.",
        details: evaluation.reasons,
        missingPrerequisites: evaluation.missingPrerequisites,
        conflictWith: evaluation.conflicts
      });
    }

    if (Number(toCourse.seats_available) <= 0) {
      await connection.rollback();
      return res
        .status(409)
        .json({ error: "Target section has no available seats right now." });
    }

    const fromEnrollment = fromEnrollmentRows[0];

    await connection.query(
      `UPDATE enrollments
       SET status = 'dropped', source = 'switch'
       WHERE id = ?`,
      [fromEnrollment.id]
    );

    await connection.query(
      `UPDATE courses
       SET seats_available = LEAST(seats_total, seats_available + 1)
       WHERE id = ?`,
      [fromCourseId]
    );

    const [targetResult] = await connection.query(
      `INSERT INTO enrollments (student_id, course_id, semester_id, status, source)
       VALUES (?, ?, ?, 'registered', 'switch')
       ON DUPLICATE KEY UPDATE
         status = 'registered',
         source = 'switch',
         semester_id = VALUES(semester_id),
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, toCourseId, toCourse.semester_id]
    );

    await connection.query(
      `UPDATE courses
       SET seats_available = GREATEST(0, seats_available - 1)
       WHERE id = ?`,
      [toCourseId]
    );

    await logEnrollmentHistory(connection, {
      enrollmentId: fromEnrollment.id,
      studentId: req.user.id,
      courseId: fromCourseId,
      actionType: "switch",
      note: `Switched out to ${toCourse.code}.`
    });

    await logEnrollmentHistory(connection, {
      enrollmentId: targetResult.insertId || null,
      studentId: req.user.id,
      courseId: toCourseId,
      actionType: "switch",
      note: `Switched in from ${fromCourse.code}.`
    });

    await processWaitlistForCourse(connection, fromCourseId);

    await createNotification(
      connection,
      req.user.id,
      "registration_confirmation",
      `Section switched successfully: ${fromCourse.code} -> ${toCourse.code}.`,
      { fromCourseId, toCourseId }
    );

    await connection.commit();

    return res.json({
      message: "Section switched successfully.",
      from: fromCourse.code,
      to: toCourse.code
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/waitlist", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.position_no, w.status, w.created_at,
              c.id AS course_id, c.code, c.title, c.schedule_block,
              s.name AS semester_name, s.academic_year
       FROM waitlist_entries w
       JOIN courses c ON c.id = w.course_id
       LEFT JOIN semesters s ON s.id = w.semester_id
       WHERE w.student_id = ?
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );

    return res.json({ waitlist: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/status/:applicationId", async (req, res, next) => {
  const applicationId = Number(req.params.applicationId);

  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(400).json({ error: "Invalid application id." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT e.id AS application_id, e.status, e.source, e.enrolled_at, e.updated_at,
              c.id AS course_id, c.code, c.title, c.section_label, c.schedule_block, c.credits,
              w.position_no AS waitlist_position
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN waitlist_entries w
              ON w.course_id = e.course_id
             AND w.student_id = e.student_id
             AND w.status = 'active'
       WHERE e.id = ?
         AND e.student_id = ?`,
      [applicationId, req.user.id]
    );

    const application = rows[0];
    if (!application) {
      return res.status(404).json({ error: "Application not found." });
    }

    return res.json({ application });
  } catch (error) {
    return next(error);
  }
});

router.get("/timetable", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.course_group, c.section_label, c.title,
              c.schedule_block, c.credits
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = ?
         AND e.status IN ('registered', 'approved', 'pending')
       ORDER BY c.code ASC`,
      [req.user.id]
    );

    const weekly = {
      MON: [],
      TUE: [],
      WED: [],
      THU: [],
      FRI: [],
      SAT: [],
      SUN: []
    };

    rows.forEach((course) => {
      const slots = parseScheduleBlock(course.schedule_block);
      slots.forEach((slot) => {
        weekly[slot.day].push({
          courseId: course.id,
          code: course.code,
          title: course.title,
          start: slot.start,
          end: slot.end,
          scheduleBlock: course.schedule_block
        });
      });
    });

    const conflicts = [];
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        if (hasScheduleConflict(rows[i].schedule_block, rows[j].schedule_block)) {
          conflicts.push({
            first: rows[i].code,
            second: rows[j].code,
            message: `${rows[i].code} overlaps with ${rows[j].code}`
          });
        }
      }
    }

    Object.keys(weekly).forEach((day) => {
      weekly[day].sort((a, b) => a.start - b.start);
    });

    return res.json({
      registeredCourses: rows,
      weeklyCalendar: weekly,
      conflicts
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/alternatives/:courseId", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ error: "Invalid course id." });
  }

  try {
    const [[course]] = await pool.query(
      `SELECT id, course_group, semester_id
       FROM courses
       WHERE id = ?`,
      [courseId]
    );

    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    const [activeRows] = await pool.query(
      `SELECT c.id, c.code, c.schedule_block
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = ?
         AND e.status IN ('registered', 'approved', 'pending')
         AND c.id <> ?`,
      [req.user.id, courseId]
    );

    const [candidateRows] = await pool.query(
      `SELECT c.id, c.code, c.section_label, c.title, c.schedule_block, c.seats_available
       FROM courses c
       WHERE c.course_group = ?
         AND c.semester_id = ?
         AND c.id <> ?
       ORDER BY c.section_label ASC`,
      [course.course_group, course.semester_id, courseId]
    );

    const alternatives = candidateRows
      .filter((candidate) => Number(candidate.seats_available) > 0)
      .map((candidate) => {
        const conflictingWith = activeRows
          .filter((entry) => hasScheduleConflict(entry.schedule_block, candidate.schedule_block))
          .map((entry) => entry.code);
        return {
          ...candidate,
          conflictFree: conflictingWith.length === 0,
          conflictingWith
        };
      });

    return res.json({ alternatives });
  } catch (error) {
    return next(error);
  }
});

router.get("/progress", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  try {
    const [completedRows] = await pool.query(
      `SELECT SUM(x.credits) AS completed_credits,
              SUM(CASE WHEN x.is_core = 1 THEN x.credits ELSE 0 END) AS completed_core_credits
       FROM (
         SELECT cc.course_code,
                COALESCE(MAX(c.credits), 0) AS credits,
                COALESCE(MAX(c.is_core), 0) AS is_core
         FROM completed_courses cc
         LEFT JOIN courses c
           ON UPPER(c.course_group) = UPPER(cc.course_code)
         WHERE cc.student_id = ?
         GROUP BY cc.course_code
       ) x`,
      [req.user.id]
    );

    const [activeRows] = await pool.query(
      `SELECT COALESCE(SUM(c.credits), 0) AS current_credits,
              COALESCE(SUM(CASE WHEN c.is_core = 1 THEN c.credits ELSE 0 END), 0) AS current_core_credits
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = ?
         AND e.status IN ('registered', 'approved', 'pending')`,
      [req.user.id]
    );

    const completedCredits = Number(completedRows[0]?.completed_credits || 0);
    const completedCoreCredits = Number(completedRows[0]?.completed_core_credits || 0);
    const currentCredits = Number(activeRows[0]?.current_credits || 0);
    const currentCoreCredits = Number(activeRows[0]?.current_core_credits || 0);

    const totalCredits = completedCredits + currentCredits;
    const totalCoreCredits = completedCoreCredits + currentCoreCredits;
    const totalElectiveCredits = totalCredits - totalCoreCredits;

    const connection = await pool.getConnection();
    const requiredTotal = await getSystemSettingNumber(
      connection,
      "graduation_total_credits",
      120
    );
    const requiredCore = await getSystemSettingNumber(
      connection,
      "graduation_core_credits",
      60
    );
    connection.release();

    const graduationEligible =
      totalCredits >= requiredTotal && totalCoreCredits >= requiredCore;

    const [planRows] = await pool.query(
      `SELECT sp.id, sp.status,
              c.code, c.title, c.credits,
              s.name AS semester_name, s.academic_year
       FROM student_plans sp
       JOIN courses c ON c.id = sp.course_id
       JOIN semesters s ON s.id = sp.semester_id
       WHERE sp.student_id = ?
       ORDER BY s.starts_on ASC, c.code ASC`,
      [req.user.id]
    );

    return res.json({
      tracker: {
        completedCredits,
        currentCredits,
        totalCredits,
        requiredTotal,
        remainingCredits: Math.max(0, requiredTotal - totalCredits)
      },
      coreElective: {
        coreCredits: totalCoreCredits,
        electiveCredits: totalElectiveCredits,
        requiredCore,
        remainingCoreCredits: Math.max(0, requiredCore - totalCoreCredits)
      },
      graduationEligible,
      planner: planRows
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/planner", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT sp.id, sp.status, sp.created_at,
              c.id AS course_id, c.code, c.title, c.credits,
              s.id AS semester_id, s.name AS semester_name, s.academic_year
       FROM student_plans sp
       JOIN courses c ON c.id = sp.course_id
       JOIN semesters s ON s.id = sp.semester_id
       WHERE sp.student_id = ?
       ORDER BY s.starts_on ASC, c.code ASC`,
      [req.user.id]
    );

    return res.json({ plans: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/planner", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const courseId = Number(req.body.courseId);
  const semesterId = Number(req.body.semesterId);

  if (!Number.isInteger(courseId) || !Number.isInteger(semesterId)) {
    return res.status(400).json({ error: "courseId and semesterId are required." });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO student_plans (student_id, course_id, semester_id, status)
       VALUES (?, ?, ?, 'planned')
       ON DUPLICATE KEY UPDATE
         status = 'planned'`,
      [req.user.id, courseId, semesterId]
    );

    return res.status(201).json({
      message: "Course added to semester planner.",
      planId: result.insertId || null
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/planner/:planId", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const planId = Number(req.params.planId);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ error: "Invalid plan id." });
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM student_plans WHERE id = ? AND student_id = ?",
      [planId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Plan item not found." });
    }

    return res.json({ message: "Plan item removed." });
  } catch (error) {
    return next(error);
  }
});

router.post("/requests", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const requestType = String(req.body.requestType || "").trim();
  const reason = String(req.body.reason || "").trim();
  const courseId = req.body.courseId ? Number(req.body.courseId) : null;

  if (!["credit_overload", "prerequisite_override"].includes(requestType)) {
    return res.status(400).json({ error: "Invalid requestType." });
  }

  if (!reason) {
    return res.status(400).json({ error: "Reason is required." });
  }

  if (requestType === "prerequisite_override" && !courseId) {
    return res
      .status(400)
      .json({ error: "courseId is required for prerequisite override requests." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO registration_requests
       (student_id, course_id, request_type, reason, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [req.user.id, courseId, requestType, reason]
    );

    const [approverRows] = await connection.query(
      `SELECT id
       FROM users
       WHERE role IN ('advisor', 'admin')`
    );

    for (const approver of approverRows) {
      await createNotification(
        connection,
        approver.id,
        "announcement",
        `New ${requestType.replace("_", " ")} request submitted by student #${req.user.id}.`,
        {
          requestId: result.insertId,
          requestType,
          studentId: req.user.id,
          courseId: courseId || null
        }
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: "Request submitted for approval.",
      requestId: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/requests/my", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.request_type, r.reason, r.status, r.created_at, r.updated_at,
              c.code AS course_code, c.title AS course_title,
              advisor.full_name AS advisor_name,
              admin.full_name AS admin_name
       FROM registration_requests r
       LEFT JOIN courses c ON c.id = r.course_id
       LEFT JOIN users advisor ON advisor.id = r.advisor_id
       LEFT JOIN users admin ON admin.id = r.admin_id
       WHERE r.student_id = ?
       ORDER BY r.updated_at DESC`,
      [req.user.id]
    );

    return res.json({ requests: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/reviews", async (req, res, next) => {
  if (!requireStudent(req, res)) {
    return;
  }

  const courseId = Number(req.body.courseId);
  const rating = Number(req.body.rating);
  const reviewText = String(req.body.reviewText || "").trim();

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ error: "Valid courseId is required." });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5." });
  }

  try {
    await pool.query(
      `INSERT INTO course_reviews (course_id, student_id, rating, review_text)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         review_text = VALUES(review_text)`,
      [courseId, req.user.id, rating, reviewText || null]
    );

    return res.status(201).json({ message: "Review submitted successfully." });
  } catch (error) {
    return next(error);
  }
});

router.get("/reviews/:courseId", async (req, res, next) => {
  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ error: "Invalid course id." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT cr.id, cr.rating, cr.review_text, cr.faculty_feedback, cr.created_at,
              u.full_name AS student_name
       FROM course_reviews cr
       JOIN users u ON u.id = cr.student_id
       WHERE cr.course_id = ?
       ORDER BY cr.created_at DESC`,
      [courseId]
    );

    return res.json({ reviews: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/popularity", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.title,
              COUNT(DISTINCT e.id) AS enrolled_count,
              COALESCE(ROUND(AVG(cr.rating), 2), 0) AS average_rating
       FROM courses c
       LEFT JOIN enrollments e
              ON e.course_id = c.id
             AND e.status IN ('registered', 'approved', 'pending')
       LEFT JOIN course_reviews cr ON cr.course_id = c.id
       GROUP BY c.id, c.code, c.title
       ORDER BY enrolled_count DESC, average_rating DESC
       LIMIT 20`
    );

    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/announcements", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, body, target_role, created_at
       FROM announcements
       WHERE is_active = 1
         AND (target_role = 'all' OR target_role = ?)
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.role]
    );

    return res.json({ announcements: rows });
  } catch (error) {
    return next(error);
  }
});

export default router;
