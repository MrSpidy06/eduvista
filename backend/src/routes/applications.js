import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createUploader, toPublicUploadPath } from "../middleware/upload.js";
import { createNotification } from "../utils/registration.js";

const router = Router();
const applicationUpload = createUploader("application-documents");

const buildFitScore = (profile, requirementCount, documentCount) => {
  let score = 25;
  if (profile?.phone) {
    score += 15;
  }
  if (profile?.marks_summary) {
    score += 20;
  }
  if (profile?.bio) {
    score += 10;
  }
  if (requirementCount > 0) {
    score += Math.min(30, (documentCount / requirementCount) * 30);
  }
  return Math.min(100, Math.round(score * 100) / 100);
};

router.use(requireAuth);

router.get("/catalog", async (req, res, next) => {
  try {
    const params = [];
    const filters = [];

    if (req.query.q) {
      filters.push(
        "(c.title LIKE ? OR c.code LIKE ? OR up.university_name LIKE ? OR c.qualification_required LIKE ?)"
      );
      const wildcard = `%${String(req.query.q).trim()}%`;
      params.push(wildcard, wildcard, wildcard, wildcard);
    }

    if (req.query.state) {
      filters.push("c.location_state = ?");
      params.push(String(req.query.state));
    }

    if (req.query.city) {
      filters.push("c.location_city = ?");
      params.push(String(req.query.city));
    }

    if (req.query.category) {
      filters.push("c.category = ?");
      params.push(String(req.query.category));
    }

    if (req.query.universityId) {
      filters.push("c.university_id = ?");
      params.push(Number(req.query.universityId));
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const queryParams = req.user.role === "student" ? [req.user.id, ...params] : params;

    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.title, c.category, c.description, c.duration_label,
              c.location_state, c.location_city, c.qualification_required,
              c.approx_fee_total, c.application_deadline, c.required_documents_intro,
              c.brochure_path, up.university_name, up.short_name, up.application_bar_label,
              COUNT(DISTINCT cr.id) AS requirement_count,
              ${req.user.role === "student"
                ? "MAX(ca.id) AS application_id, MAX(ca.status) AS application_status,"
                : ""}
              CASE
                WHEN c.application_deadline IS NOT NULL AND c.application_deadline < CURDATE()
                THEN 1
                ELSE 0
              END AS is_closed,
              COUNT(DISTINCT ca_all.id) AS applicant_count
       FROM courses c
       LEFT JOIN university_profiles up ON up.user_id = c.university_id
       LEFT JOIN course_requirements cr ON cr.course_id = c.id
       ${req.user.role === "student"
         ? "LEFT JOIN course_applications ca ON ca.course_id = c.id AND ca.student_id = ?"
         : ""}
       LEFT JOIN course_applications ca_all ON ca_all.course_id = c.id
       ${whereClause}
       GROUP BY c.id, up.university_name, up.short_name, up.application_bar_label
       ORDER BY
         CASE WHEN c.application_deadline IS NULL THEN 1 ELSE 0 END,
         c.application_deadline ASC,
         c.created_at DESC`,
      queryParams
    );

    return res.json({ catalog: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/meta", async (_req, res, next) => {
  try {
    const [states] = await pool.query(
      `SELECT DISTINCT location_state AS value
       FROM courses
       WHERE location_state IS NOT NULL AND location_state <> ''
       ORDER BY location_state ASC`
    );
    const [cities] = await pool.query(
      `SELECT DISTINCT location_city AS value
       FROM courses
       WHERE location_city IS NOT NULL AND location_city <> ''
       ORDER BY location_city ASC`
    );
    const [categories] = await pool.query(
      `SELECT DISTINCT category AS value
       FROM courses
       WHERE category IS NOT NULL AND category <> ''
       ORDER BY category ASC`
    );
    const [universities] = await pool.query(
      `SELECT user_id AS id, university_name
       FROM university_profiles
       ORDER BY university_name ASC`
    );

    return res.json({
      states: states.map((item) => item.value),
      cities: cities.map((item) => item.value),
      categories: categories.map((item) => item.value),
      universities
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/my", requireRole("student"), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ca.id, ca.status, ca.statement, ca.fit_score, ca.applied_at, ca.updated_at,
              c.code, c.title, c.category, c.application_deadline,
              up.university_name,
              COUNT(DISTINCT ad.id) AS document_count
       FROM course_applications ca
       JOIN courses c ON c.id = ca.course_id
       LEFT JOIN university_profiles up ON up.user_id = ca.university_id
       LEFT JOIN application_documents ad ON ad.application_id = ca.id
       WHERE ca.student_id = ?
       GROUP BY ca.id, c.code, c.title, c.category, c.application_deadline, up.university_name
       ORDER BY ca.updated_at DESC`,
      [req.user.id]
    );

    return res.json({ applications: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", requireRole("student", "university", "admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid application id." });
    }

    const params = [id];
    let clause = "";
    if (req.user.role === "student") {
      clause = " AND ca.student_id = ?";
      params.push(req.user.id);
    } else if (req.user.role === "university") {
      clause = " AND ca.university_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.query(
      `SELECT ca.id, ca.course_id, ca.status, ca.statement, ca.fit_score, ca.applied_at, ca.updated_at,
              c.code, c.title, c.category, c.application_deadline,
              up.university_name,
              s.id AS student_id,
              s.full_name AS student_name,
              s.email AS student_email,
              s.year_level,
              s.cgpa,
              sp.phone AS student_phone,
              sp.city AS student_city,
              sp.state AS student_state,
              sp.school_name,
              sp.marks_summary,
              sp.bio
       FROM course_applications ca
       JOIN courses c ON c.id = ca.course_id
       JOIN users s ON s.id = ca.student_id
       LEFT JOIN university_profiles up ON up.user_id = ca.university_id
       LEFT JOIN student_profiles sp ON sp.user_id = ca.student_id
       WHERE ca.id = ?${clause}
       LIMIT 1`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Application not found." });
    }

    const [documents] = await pool.query(
      `SELECT id, requirement_name, original_name, file_path, uploaded_at
       FROM application_documents
       WHERE application_id = ?
       ORDER BY uploaded_at DESC`,
      [id]
    );

    const [requirements] = await pool.query(
      `SELECT cr.id, cr.document_name, cr.is_required, cr.instructions,
              MAX(CASE WHEN ad.id IS NOT NULL THEN 1 ELSE 0 END) AS uploaded
       FROM course_requirements cr
       LEFT JOIN application_documents ad
         ON ad.application_id = ?
        AND ad.requirement_name = cr.document_name
       WHERE cr.course_id = ?
       GROUP BY cr.id, cr.document_name, cr.is_required, cr.instructions
       ORDER BY cr.created_at ASC`,
      [id, rows[0].course_id]
    );

    return res.json({ application: rows[0], documents, requirements });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("student"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const courseId = Number(req.body.courseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Valid courseId is required." });
    }

    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT c.id, c.title, c.university_id, c.application_deadline,
              c.application_deadline < CURDATE() AS deadline_passed,
              up.university_name
       FROM courses c
       LEFT JOIN university_profiles up ON up.user_id = c.university_id
       WHERE c.id = ?
       LIMIT 1
       FOR UPDATE`,
      [courseId]
    );

    const course = courseRows[0];
    if (!course || !course.university_id) {
      await connection.rollback();
      return res.status(404).json({ error: "Course is not available for applications." });
    }

    if (Number(course.deadline_passed) === 1) {
      await connection.rollback();
      return res.status(400).json({ error: "The application deadline for this course has passed." });
    }

    const [profileRows] = await connection.query(
      `SELECT phone, marks_summary, bio
       FROM student_profiles
       WHERE user_id = ?`,
      [req.user.id]
    );
    const profile = profileRows[0] || null;

    const [[requirementCountRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM course_requirements
       WHERE course_id = ?`,
      [courseId]
    );

    const fitScore = buildFitScore(profile, Number(requirementCountRow.total), 0);

    const [result] = await connection.query(
      `INSERT INTO course_applications
         (student_id, course_id, university_id, status, statement, fit_score)
       VALUES (?, ?, ?, 'submitted', ?, ?)
       ON DUPLICATE KEY UPDATE
         statement = VALUES(statement),
         fit_score = VALUES(fit_score),
         status = 'submitted'`,
      [
        req.user.id,
        courseId,
        course.university_id,
        req.body.statement || null,
        fitScore
      ]
    );

    const [[application]] = await connection.query(
      `SELECT id
       FROM course_applications
       WHERE student_id = ? AND course_id = ?
       LIMIT 1`,
      [req.user.id, courseId]
    );

    await createNotification(
      connection,
      course.university_id,
      "announcement",
      `New application received for ${course.title}.`,
      { courseId, studentId: req.user.id }
    );

    await connection.commit();

    return res.status(201).json({
      applicationId: application?.id || result.insertId || null,
      fitScore,
      message: `Application submitted to ${course.university_name || "the university"}.`
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post(
  "/:id/documents",
  requireRole("student"),
  applicationUpload.single("file"),
  async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid application id." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "File is required." });
      }

      await connection.beginTransaction();

      const [applicationRows] = await connection.query(
        `SELECT id, student_id, course_id
         FROM course_applications
         WHERE id = ? AND student_id = ?
         LIMIT 1
         FOR UPDATE`,
        [id, req.user.id]
      );

      const application = applicationRows[0];
      if (!application) {
        await connection.rollback();
        return res.status(404).json({ error: "Application not found." });
      }

      const requirementName = String(req.body.requirementName || "Supporting Document").trim();

      const [docResult] = await connection.query(
        `INSERT INTO application_documents
           (application_id, requirement_name, original_name, stored_name, file_path)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          requirementName,
          req.file.originalname,
          req.file.filename,
          toPublicUploadPath(req.file)
        ]
      );

      const [profileRows] = await connection.query(
        `SELECT phone, marks_summary, bio
         FROM student_profiles
         WHERE user_id = ?`,
        [req.user.id]
      );
      const profile = profileRows[0] || null;
      const [[requirementCountRow]] = await connection.query(
        `SELECT COUNT(*) AS total
         FROM course_requirements
         WHERE course_id = ?`,
        [application.course_id]
      );
      const [[documentCountRow]] = await connection.query(
        `SELECT COUNT(*) AS total
         FROM application_documents
         WHERE application_id = ?`,
        [id]
      );

      const fitScore = buildFitScore(
        profile,
        Number(requirementCountRow.total),
        Number(documentCountRow.total)
      );

      await connection.query(
        `UPDATE course_applications
         SET fit_score = ?
         WHERE id = ?`,
        [fitScore, id]
      );

      await connection.commit();
      return res.status(201).json({
        documentId: docResult.insertId,
        filePath: toPublicUploadPath(req.file),
        fitScore
      });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  }
);

router.delete("/documents/:id", requireRole("student"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid document id." });
    }

    await connection.beginTransaction();

    const [documentRows] = await connection.query(
      `SELECT ad.id, ad.application_id, ca.course_id
       FROM application_documents ad
       JOIN course_applications ca ON ca.id = ad.application_id
       WHERE ad.id = ? AND ca.student_id = ?
       LIMIT 1
       FOR UPDATE`,
      [id, req.user.id]
    );

    const document = documentRows[0];
    if (!document) {
      await connection.rollback();
      return res.status(404).json({ error: "Document not found." });
    }

    await connection.query("DELETE FROM application_documents WHERE id = ?", [id]);

    const [profileRows] = await connection.query(
      `SELECT phone, marks_summary, bio
       FROM student_profiles
       WHERE user_id = ?`,
      [req.user.id]
    );
    const profile = profileRows[0] || null;
    const [[requirementCountRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM course_requirements
       WHERE course_id = ?`,
      [document.course_id]
    );
    const [[documentCountRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM application_documents
       WHERE application_id = ?`,
      [document.application_id]
    );

    const fitScore = buildFitScore(
      profile,
      Number(requirementCountRow.total),
      Number(documentCountRow.total)
    );

    await connection.query(
      `UPDATE course_applications
       SET fit_score = ?
       WHERE id = ?`,
      [fitScore, document.application_id]
    );

    await connection.commit();
    return res.json({ message: "Document removed.", fitScore });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export default router;
