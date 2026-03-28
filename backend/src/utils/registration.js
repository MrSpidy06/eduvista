import { hasScheduleConflict } from "./schedule.js";

export const ACTIVE_ENROLLMENT_STATUSES = ["registered", "approved", "pending"];

export const parsePrerequisites = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item && item !== "NONE" && item !== "N/A");

export const getSystemSetting = async (connection, key, fallback = null) => {
  const [rows] = await connection.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1",
    [key]
  );
  if (rows.length === 0) {
    return fallback;
  }
  return rows[0].setting_value;
};

export const getSystemSettingNumber = async (connection, key, fallback = 0) => {
  const value = await getSystemSetting(connection, key, String(fallback));
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const getRegistrationFrozen = async (connection) => {
  const value = await getSystemSetting(connection, "registration_frozen", "0");
  return String(value) === "1";
};

export const getActiveSemester = async (connection, semesterId = null) => {
  if (semesterId) {
    const [rows] = await connection.query(
      `SELECT id, name, academic_year, starts_on, ends_on,
              registration_starts_at, registration_ends_at,
              add_drop_starts_at, add_drop_ends_at, is_active
       FROM semesters
       WHERE id = ?
       LIMIT 1`,
      [semesterId]
    );
    return rows[0] || null;
  }

  const [rows] = await connection.query(
    `SELECT id, name, academic_year, starts_on, ends_on,
            registration_starts_at, registration_ends_at,
            add_drop_starts_at, add_drop_ends_at, is_active
     FROM semesters
     ORDER BY is_active DESC, starts_on DESC
     LIMIT 1`
  );

  return rows[0] || null;
};

export const getCurrentPhase = async (connection, semesterId) => {
  const [currentRows] = await connection.query(
    `SELECT id, phase_name, starts_at, ends_at, min_year_level, min_cgpa
     FROM registration_phases
     WHERE semester_id = ?
       AND NOW() BETWEEN starts_at AND ends_at
     ORDER BY starts_at ASC
     LIMIT 1`,
    [semesterId]
  );

  if (currentRows[0]) {
    return {
      phase: currentRows[0],
      state: "active"
    };
  }

  const [nextRows] = await connection.query(
    `SELECT id, phase_name, starts_at, ends_at, min_year_level, min_cgpa
     FROM registration_phases
     WHERE semester_id = ?
       AND starts_at > NOW()
     ORDER BY starts_at ASC
     LIMIT 1`,
    [semesterId]
  );

  if (nextRows[0]) {
    return {
      phase: nextRows[0],
      state: "upcoming"
    };
  }

  return {
    phase: null,
    state: "closed"
  };
};

export const releaseExpiredSeatHolds = async (connection) => {
  await connection.query(
    `UPDATE courses c
     JOIN (
       SELECT course_id, COUNT(*) AS hold_count
       FROM seat_holds
       WHERE status = 'active' AND expires_at <= NOW()
       GROUP BY course_id
     ) expired ON expired.course_id = c.id
     SET c.seats_available = LEAST(c.seats_total, c.seats_available + expired.hold_count)`
  );

  await connection.query(
    `UPDATE seat_holds
     SET status = 'expired'
     WHERE status = 'active' AND expires_at <= NOW()`
  );
};

export const createNotification = async (
  connection,
  userId,
  category,
  message,
  meta = null
) => {
  await connection.query(
    `INSERT INTO notifications (user_id, category, message, meta_json)
     VALUES (?, ?, ?, ?)`,
    [userId, category, message, meta ? JSON.stringify(meta) : null]
  );
};

export const logEnrollmentHistory = async (
  connection,
  { enrollmentId = null, studentId, courseId, actionType, note = null }
) => {
  await connection.query(
    `INSERT INTO enrollment_history
       (enrollment_id, student_id, course_id, action_type, note)
     VALUES (?, ?, ?, ?, ?)`,
    [enrollmentId, studentId, courseId, actionType, note]
  );
};

const loadCompletedCourseSet = async (connection, studentId) => {
  const [completedRows] = await connection.query(
    `SELECT UPPER(course_code) AS course_code
     FROM completed_courses
     WHERE student_id = ?`,
    [studentId]
  );

  const [activeRows] = await connection.query(
    `SELECT UPPER(c.course_group) AS course_group
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ?
       AND e.status IN ('registered', 'approved', 'pending')`,
    [studentId]
  );

  return new Set([
    ...completedRows.map((row) => String(row.course_code || "").toUpperCase()),
    ...activeRows.map((row) => String(row.course_group || "").toUpperCase())
  ]);
};

const loadStudentEnrollments = async (connection, studentId, ignoreCourseId = null) => {
  const params = [studentId];
  let clause = "";

  if (ignoreCourseId) {
    clause = " AND c.id <> ?";
    params.push(ignoreCourseId);
  }

  const [rows] = await connection.query(
    `SELECT e.id AS enrollment_id, e.status,
            c.id AS course_id, c.code, c.course_group, c.credits, c.schedule_block
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ?
       AND e.status IN ('registered', 'approved', 'pending')${clause}`,
    params
  );

  return rows;
};

export const evaluateRegistration = async (
  connection,
  { studentId, courseId, ignoreCourseId = null, mode = "register" }
) => {
  const [studentRows] = await connection.query(
    `SELECT id, role, financial_hold, max_credits, year_level, cgpa, registration_frozen
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [studentId]
  );
  const student = studentRows[0] || null;

  const [courseRows] = await connection.query(
    `SELECT c.id, c.code, c.course_group, c.section_label, c.title, c.credits,
            c.seats_available, c.seats_total, c.waitlist_capacity,
            c.schedule_block, c.prerequisites, c.min_year_level, c.min_cgpa,
            c.registration_starts_at, c.registration_ends_at, c.add_drop_ends_at,
            c.semester_id, d.name AS department_name,
            s.name AS semester_name, s.academic_year,
            s.registration_starts_at AS sem_registration_starts_at,
            s.registration_ends_at AS sem_registration_ends_at,
            s.add_drop_ends_at AS sem_add_drop_ends_at
     FROM courses c
     LEFT JOIN departments d ON d.id = c.department_id
     LEFT JOIN semesters s ON s.id = c.semester_id
     WHERE c.id = ?
     LIMIT 1`,
    [courseId]
  );
  const course = courseRows[0] || null;

  if (!student || !course) {
    return {
      ok: false,
      student,
      course,
      reasons: [!student ? "Student account not found." : "Course not found."],
      missingPrerequisites: [],
      conflicts: [],
      activeCredits: 0,
      projectedCredits: 0,
      phase: null
    };
  }

  const registrationFrozen = await getRegistrationFrozen(connection);
  const phaseInfo = await getCurrentPhase(connection, course.semester_id);
  const phase = phaseInfo.phase;

  const activeEnrollments = await loadStudentEnrollments(
    connection,
    studentId,
    ignoreCourseId
  );

  const activeCredits = activeEnrollments.reduce(
    (sum, row) => sum + Number(row.credits || 0),
    0
  );
  const projectedCredits = activeCredits + Number(course.credits || 0);

  const completedSet = await loadCompletedCourseSet(connection, studentId);
  const required = parsePrerequisites(course.prerequisites);
  const missingPrerequisites = required.filter((item) => !completedSet.has(item));

  const [overrideRows] = await connection.query(
    `SELECT id
     FROM registration_requests
     WHERE student_id = ?
       AND course_id = ?
       AND request_type = 'prerequisite_override'
       AND status = 'admin_approved'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [studentId, courseId]
  );

  const [overloadRows] = await connection.query(
    `SELECT id
     FROM registration_requests
     WHERE student_id = ?
       AND request_type = 'credit_overload'
       AND status = 'admin_approved'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [studentId]
  );

  const conflicts = activeEnrollments
    .filter((entry) => hasScheduleConflict(entry.schedule_block, course.schedule_block))
    .map((entry) => entry.code);

  const reasons = [];

  if (registrationFrozen || Boolean(student.registration_frozen)) {
    reasons.push("Registration is currently frozen by administration.");
  }

  if (Boolean(student.financial_hold)) {
    reasons.push("Registration blocked due to a financial hold.");
  }

  if (student.role !== "student") {
    reasons.push("Only student accounts can register for courses.");
  }

  if (Number(student.year_level || 1) < Number(course.min_year_level || 1)) {
    reasons.push(
      `Minimum year level requirement is ${course.min_year_level} for this course.`
    );
  }

  if (Number(student.cgpa || 0) < Number(course.min_cgpa || 0)) {
    reasons.push(`Minimum CGPA requirement is ${Number(course.min_cgpa).toFixed(2)}.`);
  }

  if (
    mode !== "waitlist_auto" &&
    course.registration_starts_at &&
    course.registration_ends_at
  ) {
    const now = Date.now();
    const starts = new Date(course.registration_starts_at).getTime();
    const ends = new Date(course.registration_ends_at).getTime();
    if (now < starts || now > ends) {
      reasons.push("Course registration window is closed for this section.");
    }
  }

  if (mode !== "waitlist_auto") {
    const now = Date.now();
    const semesterWindowOpen =
      course.sem_registration_starts_at &&
      course.sem_registration_ends_at &&
      now >= new Date(course.sem_registration_starts_at).getTime() &&
      now <= new Date(course.sem_registration_ends_at).getTime();

    if (!phase || phaseInfo.state !== "active") {
      if (!semesterWindowOpen) {
        reasons.push("No active registration phase or open semester window right now.");
      }
    } else {
      if (Number(student.year_level || 1) < Number(phase.min_year_level || 1)) {
        reasons.push(
          `Current phase requires year ${phase.min_year_level}+ students.`
        );
      }
      if (Number(student.cgpa || 0) < Number(phase.min_cgpa || 0)) {
        reasons.push(
          `Current phase requires minimum CGPA ${Number(phase.min_cgpa).toFixed(2)}.`
        );
      }
    }
  }

  if (missingPrerequisites.length > 0 && overrideRows.length === 0) {
    reasons.push("Prerequisite requirement not met.");
  }

  if (conflicts.length > 0) {
    reasons.push("Schedule conflict detected.");
  }

  const overloadAllowance = await getSystemSettingNumber(
    connection,
    "max_overload_extra_credits",
    6
  );

  const maxCredits = Number(student.max_credits || 24);
  const overloadMax = maxCredits + overloadAllowance;

  if (projectedCredits > maxCredits && overloadRows.length === 0) {
    reasons.push(`Credit limit exceeded. Maximum allowed is ${maxCredits}.`);
  } else if (projectedCredits > overloadMax) {
    reasons.push(`Projected credits exceed overload ceiling (${overloadMax}).`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    missingPrerequisites,
    conflicts,
    activeCredits,
    projectedCredits,
    student,
    course,
    phase,
    overloadApproved: overloadRows.length > 0,
    prerequisiteOverrideApproved: overrideRows.length > 0
  };
};

export const getWaitlistPosition = async (connection, courseId, studentId) => {
  const [rows] = await connection.query(
    `SELECT position_no
     FROM waitlist_entries
     WHERE course_id = ?
       AND student_id = ?
       AND status = 'active'
     LIMIT 1`,
    [courseId, studentId]
  );
  return rows[0]?.position_no || null;
};

export const processWaitlistForCourse = async (connection, courseId) => {
  // Process waitlist until no seat is left or no eligible waitlist candidates exist.
  while (true) {
    const [[course]] = await connection.query(
      `SELECT id, code, title, seats_available
       FROM courses
       WHERE id = ?
       LIMIT 1`,
      [courseId]
    );

    if (!course || Number(course.seats_available) <= 0) {
      break;
    }

    const [waitlistRows] = await connection.query(
      `SELECT id, student_id, position_no
       FROM waitlist_entries
       WHERE course_id = ?
         AND status = 'active'
       ORDER BY position_no ASC
       LIMIT 1`,
      [courseId]
    );

    const candidate = waitlistRows[0];
    if (!candidate) {
      break;
    }

    const evaluation = await evaluateRegistration(connection, {
      studentId: candidate.student_id,
      courseId,
      mode: "waitlist_auto"
    });

    if (!evaluation.ok) {
      await connection.query(
        `UPDATE waitlist_entries
         SET status = 'cancelled'
         WHERE id = ?`,
        [candidate.id]
      );

      await createNotification(
        connection,
        candidate.student_id,
        "waitlist_update",
        `${course.code} waitlist entry cancelled: ${evaluation.reasons.join(" ")}`,
        { courseId }
      );
      continue;
    }

    const [result] = await connection.query(
      `INSERT INTO enrollments (student_id, course_id, semester_id, status, source)
       VALUES (?, ?, ?, 'registered', 'waitlist_auto')
       ON DUPLICATE KEY UPDATE
         status = 'registered',
         source = 'waitlist_auto',
         semester_id = VALUES(semester_id),
         updated_at = CURRENT_TIMESTAMP`,
      [candidate.student_id, courseId, evaluation.course.semester_id]
    );

    await connection.query(
      `UPDATE waitlist_entries
       SET status = 'auto_enrolled'
       WHERE id = ?`,
      [candidate.id]
    );

    await connection.query(
      `UPDATE courses
       SET seats_available = GREATEST(0, seats_available - 1)
       WHERE id = ?`,
      [courseId]
    );

    await logEnrollmentHistory(connection, {
      enrollmentId: result.insertId || null,
      studentId: candidate.student_id,
      courseId,
      actionType: "auto_enroll",
      note: `Auto-enrolled from waitlist position ${candidate.position_no}.`
    });

    await createNotification(
      connection,
      candidate.student_id,
      "seat_available",
      `You were auto-enrolled in ${course.code} (${course.title}) from the waitlist.`,
      { courseId, waitlistPosition: candidate.position_no }
    );
  }
};
