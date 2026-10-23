import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createUploader, toPublicUploadPath } from "../middleware/upload.js";
import { createNotification } from "../utils/registration.js";
import {
  buildGeneratedCourseCode,
  normalizeCourseDeliveryMode,
  serializeEligibleAcademicLevels,
  validateSchoolAdmissionsCourse
} from "../utils/admissions.js";

const router = Router();
const assetUpload = createUploader("university-assets");

const requireOwnershipFilter = (req) =>
  req.user.role === "admin" ? { clause: "", params: [] } : { clause: "WHERE c.university_id = ?", params: [req.user.id] };

const parseMinimumScorePercent = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue < 0 || numericValue > 100) {
    return Number.NaN;
  }

  return numericValue;
};

const getCoursePayloadValidationError = ({
  title,
  category,
  deliveryMode,
  locationState,
  locationCity,
  durationLabel,
  qualificationRequired,
  approxFeeTotal
}) => {
  if (!String(title || "").trim()) {
    return "Course name is required.";
  }

  if (!String(category || "").trim()) {
    return "Category is required.";
  }

  if (!normalizeCourseDeliveryMode(deliveryMode)) {
    return "Delivery mode must be offline, online, or both.";
  }

  if (!String(locationState || "").trim() || !String(locationCity || "").trim()) {
    return "State and City/Location are required for every course.";
  }

  if (!String(durationLabel || "").trim()) {
    return "Duration of course is required.";
  }

  if (!String(qualificationRequired || "").trim()) {
    return "Qualification Required is mandatory for every course listing.";
  }

  if (!String(approxFeeTotal || "").trim()) {
    return "Approx Fee (Total) is required.";
  }

  return null;
};

router.use(requireAuth);
router.use(requireRole("university", "admin"));

router.get("/dashboard", async (req, res, next) => {
  try {
    const isAdmin = req.user.role === "admin";
    const params = isAdmin ? [] : [req.user.id, req.user.id, req.user.id];

    const [rows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM courses ${isAdmin ? "" : "WHERE university_id = ?"}) AS total_courses,
         (SELECT COUNT(*) FROM course_applications ${isAdmin ? "" : "WHERE university_id = ?"}) AS total_applications,
         (SELECT COUNT(*) FROM course_applications ${isAdmin ? "WHERE status = 'submitted'" : "WHERE university_id = ? AND status = 'submitted'"}) AS pending_reviews`,
      params
    );

    return res.json({
      stats: {
        totalCourses: Number(rows[0]?.total_courses || 0),
        totalApplications: Number(rows[0]?.total_applications || 0),
        pendingReviews: Number(rows[0]?.pending_reviews || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/assets", assetUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File is required." });
    }

    return res.status(201).json({
      fileName: req.file.originalname,
      filePath: toPublicUploadPath(req.file)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/courses", async (req, res, next) => {
  try {
    const ownership = requireOwnershipFilter(req);
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.title, c.description, c.category, c.delivery_mode, c.credits,
              c.seats_total, c.schedule_block, c.department_id, c.semester_id,
              c.location_state, c.location_city, c.duration_label,
              c.qualification_required, c.eligible_academic_levels,
              c.minimum_score_percent, c.approx_fee_total, c.application_deadline,
              c.required_documents_intro, c.brochure_path,
              s.name AS semester_name, s.academic_year,
              up.university_name,
              u.email AS institution_email,
              COUNT(DISTINCT ca.id) AS application_count,
              COUNT(DISTINCT cr.id) AS requirement_count
       FROM courses c
       LEFT JOIN semesters s ON s.id = c.semester_id
       LEFT JOIN university_profiles up ON up.user_id = c.university_id
       LEFT JOIN users u ON u.id = c.university_id
       LEFT JOIN course_applications ca ON ca.course_id = c.id
       LEFT JOIN course_requirements cr ON cr.course_id = c.id
       ${ownership.clause}
       GROUP BY c.id, s.name, s.academic_year, up.university_name, u.email
       ORDER BY c.created_at DESC`,
      ownership.params
    );

    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/courses", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const {
      code,
      title,
      category,
      deliveryMode,
      description,
      credits,
      seatsTotal,
      scheduleBlock,
      departmentId,
      semesterId,
      locationState,
      locationCity,
      durationLabel,
      qualificationRequired,
      eligibleAcademicLevels,
      minimumScorePercent,
      approxFeeTotal,
      applicationDeadline,
      brochurePath,
      requiredDocumentsIntro
    } = req.body;

    const payloadValidationError = getCoursePayloadValidationError({
      title,
      category,
      deliveryMode,
      locationState,
      locationCity,
      durationLabel,
      qualificationRequired,
      approxFeeTotal
    });
    if (payloadValidationError) {
      return res.status(400).json({ error: payloadValidationError });
    }

    const parsedMinimumScore = parseMinimumScorePercent(minimumScorePercent);
    if (Number.isNaN(parsedMinimumScore)) {
      return res.status(400).json({ error: "minimumScorePercent must be between 0 and 100." });
    }

    const eligibilityValidationError = validateSchoolAdmissionsCourse({
      eligibleAcademicLevels,
      qualificationRequired
    });
    if (eligibilityValidationError) {
      return res.status(400).json({ error: eligibilityValidationError });
    }

    await connection.beginTransaction();

    const [profileRows] = await connection.query(
      `SELECT university_name
       FROM university_profiles
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.role === "admin" ? Number(req.body.universityId) || null : req.user.id]
    );

    const normalizedCode =
      String(code || "").trim().toUpperCase() ||
      buildGeneratedCourseCode({
        title,
        universityName: profileRows[0]?.university_name || "university",
        userId: req.user.role === "admin" ? Number(req.body.universityId) || req.user.id : req.user.id
      });
    const group = normalizedCode.includes("-")
      ? normalizedCode.split("-").slice(0, 2).join("-")
      : normalizedCode;
    const normalizedDeliveryMode = normalizeCourseDeliveryMode(deliveryMode);

    const [result] = await connection.query(
       `INSERT INTO courses
         (code, course_group, section_label, category, delivery_mode, title, description, credits,
         seats_total, seats_available, waitlist_capacity, schedule_block, department,
         department_id, semester_id, university_id, location_state, location_city,
         duration_label, qualification_required, eligible_academic_levels,
         minimum_score_percent, approx_fee_total, application_deadline,
         brochure_path, required_documents_intro)
       VALUES (?, ?, 'A', ?, ?, ?, ?, ?, ?, ?, 50, ?, 'General', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCode,
        group,
        String(category).trim(),
        normalizedDeliveryMode,
        String(title).trim(),
        description || null,
        Number(credits) || 4,
        Number(seatsTotal) || 40,
        Number(seatsTotal) || 40,
        scheduleBlock || "Mon/Wed 09:00-10:30",
        Number(departmentId) || null,
        Number(semesterId) || null,
        req.user.role === "admin" ? Number(req.body.universityId) || null : req.user.id,
        locationState || null,
        locationCity || null,
        durationLabel || null,
        qualificationRequired || null,
        serializeEligibleAcademicLevels(eligibleAcademicLevels) || null,
        parsedMinimumScore,
        approxFeeTotal || null,
        applicationDeadline || null,
        brochurePath || null,
        requiredDocumentsIntro || null
      ]
    );

    if (Array.isArray(req.body.requirements) && req.body.requirements.length > 0) {
      for (const reqItem of req.body.requirements) {
        if (!reqItem.documentName) continue;
        await connection.query(
          `INSERT INTO course_requirements (course_id, document_name, is_required, instructions) VALUES (?, ?, ?, ?)`,
          [result.insertId, String(reqItem.documentName).trim(), reqItem.isRequired === false ? 0 : 1, reqItem.instructions || null]
        );
      }
    }

    await connection.commit();
    return res.status(201).json({ courseId: result.insertId });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Course code already exists." });
    }
    return next(error);
  } finally {
    connection.release();
  }
});

router.put("/courses/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid course id." });
    }

    const courseParams = [id];
    let ownershipClause = "";
    if (req.user.role !== "admin") {
      ownershipClause = " AND university_id = ?";
      courseParams.push(req.user.id);
    }

    const [checkRows] = await pool.query(
      `SELECT id FROM courses WHERE id = ?${ownershipClause} LIMIT 1`,
      courseParams
    );

    if (checkRows.length === 0) {
      return res.status(404).json({ error: "Course not found for this university." });
    }

    const {
      title,
      category,
      deliveryMode,
      description,
      credits,
      seatsTotal,
      scheduleBlock,
      departmentId,
      semesterId,
      locationState,
      locationCity,
      durationLabel,
      qualificationRequired,
      eligibleAcademicLevels,
      minimumScorePercent,
      approxFeeTotal,
      applicationDeadline,
      brochurePath,
      requiredDocumentsIntro
    } = req.body;

    const payloadValidationError = getCoursePayloadValidationError({
      title,
      category,
      deliveryMode,
      locationState,
      locationCity,
      durationLabel,
      qualificationRequired,
      approxFeeTotal
    });
    if (payloadValidationError) {
      return res.status(400).json({ error: payloadValidationError });
    }

    const parsedMinimumScore = parseMinimumScorePercent(minimumScorePercent);
    if (Number.isNaN(parsedMinimumScore)) {
      return res.status(400).json({ error: "minimumScorePercent must be between 0 and 100." });
    }

    const eligibilityValidationError = validateSchoolAdmissionsCourse({
      eligibleAcademicLevels,
      qualificationRequired
    });
    if (eligibilityValidationError) {
      return res.status(400).json({ error: eligibilityValidationError });
    }

    await pool.query(
      `UPDATE courses
       SET title = ?, category = ?, delivery_mode = ?, description = ?, credits = ?, seats_total = ?,
           seats_available = LEAST(seats_total, ?), schedule_block = ?, department_id = ?,
           semester_id = ?, location_state = ?, location_city = ?, duration_label = ?,
           qualification_required = ?, eligible_academic_levels = ?,
           minimum_score_percent = ?, approx_fee_total = ?, application_deadline = ?,
           brochure_path = ?, required_documents_intro = ?
       WHERE id = ?`,
      [
        title || "",
        category || "General",
        normalizeCourseDeliveryMode(deliveryMode),
        description || null,
        Number(credits) || 4,
        Number(seatsTotal) || 40,
        Number(seatsTotal) || 40,
        scheduleBlock || "Mon/Wed 09:00-10:30",
        Number(departmentId) || null,
        Number(semesterId) || null,
        locationState || null,
        locationCity || null,
        durationLabel || null,
        qualificationRequired || null,
        serializeEligibleAcademicLevels(eligibleAcademicLevels) || null,
        parsedMinimumScore,
        approxFeeTotal || null,
        applicationDeadline || null,
        brochurePath || null,
        requiredDocumentsIntro || null,
        id
      ]
    );

    if (Array.isArray(req.body.requirements)) {
      await pool.query(`DELETE FROM course_requirements WHERE course_id = ?`, [id]);
      for (const reqItem of req.body.requirements) {
        if (!reqItem.documentName) continue;
        await pool.query(
          `INSERT INTO course_requirements (course_id, document_name, is_required, instructions) VALUES (?, ?, ?, ?)`,
          [id, String(reqItem.documentName).trim(), reqItem.isRequired === false ? 0 : 1, reqItem.instructions || null]
        );
      }
    }

    return res.json({ message: "Course updated successfully." });
  } catch (error) {
    return next(error);
  }
});

router.delete("/courses/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const params = [id];
    let clause = "";
    if (req.user.role !== "admin") {
      clause = " AND university_id = ?";
      params.push(req.user.id);
    }

    const [result] = await pool.query(
      `DELETE FROM courses WHERE id = ?${clause}`,
      params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Course not found for this university." });
    }
    return res.json({ message: "Course removed." });
  } catch (error) {
    return next(error);
  }
});

router.get("/courses/:courseId/requirements", async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    const params = [courseId];
    let clause = "";
    if (req.user.role !== "admin") {
      clause = " AND c.university_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.query(
      `SELECT cr.id, cr.document_name, cr.is_required, cr.instructions
       FROM course_requirements cr
       JOIN courses c ON c.id = cr.course_id
       WHERE cr.course_id = ?${clause}
       ORDER BY cr.created_at ASC`,
      params
    );

    return res.json({ requirements: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/courses/:courseId/requirements", async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    const params = [courseId];
    let clause = "";
    if (req.user.role !== "admin") {
      clause = " AND university_id = ?";
      params.push(req.user.id);
    }
    const [courseRows] = await pool.query(
      `SELECT id FROM courses WHERE id = ?${clause} LIMIT 1`,
      params
    );
    if (courseRows.length === 0) {
      return res.status(404).json({ error: "Course not found for this university." });
    }

    const name = String(req.body.documentName || "").trim();
    if (!name) {
      return res.status(400).json({ error: "documentName is required." });
    }

    const [result] = await pool.query(
      `INSERT INTO course_requirements (course_id, document_name, is_required, instructions)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_required = VALUES(is_required),
         instructions = VALUES(instructions)`,
      [
        courseId,
        name,
        req.body.isRequired === false ? 0 : 1,
        req.body.instructions || null
      ]
    );

    return res.status(201).json({ requirementId: result.insertId || null });
  } catch (error) {
    return next(error);
  }
});

router.delete("/requirements/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const params = [id];
    let clause = "";
    if (req.user.role !== "admin") {
      clause = " AND c.university_id = ?";
      params.push(req.user.id);
    }

    const [result] = await pool.query(
      `DELETE cr
       FROM course_requirements cr
       JOIN courses c ON c.id = cr.course_id
       WHERE cr.id = ?${clause}`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Requirement not found." });
    }
    return res.json({ message: "Requirement removed." });
  } catch (error) {
    return next(error);
  }
});

router.get("/applications", async (req, res, next) => {
  try {
    const params = [];
    let clause = "";
    if (req.user.role !== "admin") {
      clause = "WHERE ca.university_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.query(
      `SELECT ca.id, ca.status, ca.statement, ca.fit_score, ca.applied_at, ca.updated_at,
              c.code, c.title, c.location_state, c.location_city,
              s.full_name AS student_name, s.email AS student_email,
              COUNT(DISTINCT ad.id) AS document_count
       FROM course_applications ca
       JOIN courses c ON c.id = ca.course_id
       JOIN users s ON s.id = ca.student_id
       LEFT JOIN application_documents ad ON ad.application_id = ca.id
       ${clause}
       GROUP BY ca.id, c.code, c.title, c.location_state, c.location_city, s.full_name, s.email
       ORDER BY ca.updated_at DESC`,
      params
    );

    return res.json({ applications: rows });
  } catch (error) {
    return next(error);
  }
});

router.patch("/applications/:id", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const nextStatus = String(req.body.status || "").trim().toLowerCase();
    const allowed = ["under_review", "shortlisted", "accepted", "rejected"];

    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ error: "Invalid application status." });
    }

    await connection.beginTransaction();

    const params = [id];
    let clause = "";
    if (req.user.role !== "admin") {
      clause = " AND ca.university_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await connection.query(
      `SELECT ca.id, ca.student_id, c.title
       FROM course_applications ca
       JOIN courses c ON c.id = ca.course_id
       WHERE ca.id = ?${clause}
       LIMIT 1
       FOR UPDATE`,
      params
    );

    const application = rows[0];
    if (!application) {
      await connection.rollback();
      return res.status(404).json({ error: "Application not found." });
    }

    await connection.query(
      `UPDATE course_applications
       SET status = ?
       WHERE id = ?`,
      [nextStatus, id]
    );

    await createNotification(
      connection,
      application.student_id,
      "announcement",
      `Your application for ${application.title} is now ${nextStatus.replace("_", " ")}.`,
      { applicationId: id, status: nextStatus }
    );

    await connection.commit();
    return res.json({ message: "Application status updated." });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export default router;
