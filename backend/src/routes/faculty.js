import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createNotification } from "../utils/registration.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("faculty", "advisor", "admin"));

router.get("/courses", async (req, res, next) => {
  try {
    const params = [];
    let whereClause = "";

    if (req.user.role === "faculty") {
      whereClause = "WHERE c.faculty_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.course_group, c.section_label, c.title,
              c.schedule_block, c.credits,
              s.name AS semester_name, s.academic_year,
              COUNT(CASE WHEN e.status IN ('registered', 'approved', 'pending') THEN 1 END) AS enrolled_count,
              COUNT(CASE WHEN e.status = 'waitlisted' THEN 1 END) AS waitlist_count
       FROM courses c
       LEFT JOIN semesters s ON s.id = c.semester_id
       LEFT JOIN enrollments e ON e.course_id = c.id
       ${whereClause}
       GROUP BY c.id, s.name, s.academic_year
       ORDER BY s.starts_on DESC, c.code ASC`,
      params
    );

    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/courses/:courseId/reviews", async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid course id." });
    }

    if (req.user.role === "faculty") {
      const [[assigned]] = await pool.query(
        `SELECT id
         FROM courses
         WHERE id = ?
           AND faculty_id = ?
         LIMIT 1`,
        [courseId, req.user.id]
      );

      if (!assigned) {
        return res
          .status(403)
          .json({ error: "You are not assigned to this course section." });
      }
    }

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

router.patch("/reviews/:reviewId/feedback", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const reviewId = Number(req.params.reviewId);
    const facultyFeedback = String(req.body.facultyFeedback || "").trim();

    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return res.status(400).json({ error: "Invalid review id." });
    }

    if (!facultyFeedback) {
      return res.status(400).json({ error: "facultyFeedback is required." });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT cr.id, cr.course_id, cr.student_id, c.faculty_id
       FROM course_reviews cr
       JOIN courses c ON c.id = cr.course_id
       WHERE cr.id = ?
       LIMIT 1
       FOR UPDATE`,
      [reviewId]
    );

    const review = rows[0];
    if (!review) {
      await connection.rollback();
      return res.status(404).json({ error: "Review not found." });
    }

    if (req.user.role === "faculty" && review.faculty_id !== req.user.id) {
      await connection.rollback();
      return res
        .status(403)
        .json({ error: "You can provide feedback only for your assigned courses." });
    }

    await connection.query(
      `UPDATE course_reviews
       SET faculty_feedback = ?
       WHERE id = ?`,
      [facultyFeedback, reviewId]
    );

    await createNotification(
      connection,
      review.student_id,
      "announcement",
      "Faculty feedback has been added to your course review.",
      { reviewId, courseId: review.course_id }
    );

    await connection.commit();

    return res.json({ message: "Faculty feedback saved." });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/requests", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.request_type, r.reason, r.status, r.created_at, r.updated_at,
              student.full_name AS student_name, student.email AS student_email,
              c.code AS course_code, c.title AS course_title
       FROM registration_requests r
       JOIN users student ON student.id = r.student_id
       LEFT JOIN courses c ON c.id = r.course_id
       WHERE r.status IN ('pending', 'advisor_approved')
       ORDER BY r.updated_at DESC`
    );

    return res.json({ requests: rows });
  } catch (error) {
    return next(error);
  }
});

router.patch("/requests/:id", async (req, res, next) => {
  if (!["advisor", "admin"].includes(req.user.role)) {
    return res
      .status(403)
      .json({ error: "Only advisor/admin roles can act on approval requests." });
  }

  const connection = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const action = String(req.body.action || "").trim().toLowerCase();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid request id." });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, student_id, request_type, status
       FROM registration_requests
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    const request = rows[0];
    if (!request) {
      await connection.rollback();
      return res.status(404).json({ error: "Request not found." });
    }

    const nextStatus = action === "approve" ? "advisor_approved" : "rejected";

    await connection.query(
      `UPDATE registration_requests
       SET status = ?, advisor_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextStatus, req.user.id, id]
    );

    await createNotification(
      connection,
      request.student_id,
      "announcement",
      `Your ${request.request_type.replace("_", " ")} request has been ${
        action === "approve" ? "advisor-approved" : "rejected"
      }.`,
      { requestId: id, status: nextStatus }
    );

    await connection.commit();

    return res.json({ message: `Request ${action}d at advisor stage.`, status: nextStatus });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const isFaculty = req.user.role === "faculty";
    const [courses] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM courses
       ${isFaculty ? "WHERE faculty_id = ?" : ""}`,
      isFaculty ? [req.user.id] : []
    );

    const [reviews] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM course_reviews cr
       JOIN courses c ON c.id = cr.course_id
       ${isFaculty ? "WHERE c.faculty_id = ?" : ""}`,
      isFaculty ? [req.user.id] : []
    );

    const [pendingRequests] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM registration_requests
       WHERE status = 'pending'`
    );

    return res.json({
      stats: {
        assignedCourses: Number(courses[0]?.total || 0),
        receivedReviews: Number(reviews[0]?.total || 0),
        pendingRequests: Number(pendingRequests[0]?.total || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
