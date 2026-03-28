import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createNotification } from "../utils/registration.js";
import { sendGenericAlertEmail, sendPaymentEmail } from "../services/email.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const unreadOnly = String(req.query.unread || "").toLowerCase() === "true";
    const params = [req.user.id];
    let where = "WHERE n.user_id = ?";

    if (unreadOnly) {
      where += " AND n.is_read = 0";
    }

    const [rows] = await pool.query(
      `SELECT n.id, n.category, n.message, n.meta_json, n.is_read, n.created_at
       FROM notifications n
       ${where}
       ORDER BY n.created_at DESC
       LIMIT 100`,
      params
    );

    const [counts] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread
       FROM notifications
       WHERE user_id = ?`,
      [req.user.id]
    );

    return res.json({
      notifications: rows,
      summary: {
        total: Number(counts[0]?.total || 0),
        unread: Number(counts[0]?.unread || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid notification id." });
    }

    const [result] = await pool.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ?
         AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }

    return res.json({ message: "Notification marked as read." });
  } catch (error) {
    return next(error);
  }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE user_id = ?
         AND is_read = 0`,
      [req.user.id]
    );

    return res.json({ message: "All notifications marked as read." });
  } catch (error) {
    return next(error);
  }
});

router.post("/payment-confirmation", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const studentId = Number(req.body.studentId || req.user.id);
    const semesterId = Number(req.body.semesterId);
    const amount = Number(req.body.amount || 0);

    if (!Number.isInteger(semesterId) || semesterId <= 0 || amount <= 0) {
      return res
        .status(400)
        .json({ error: "semesterId and positive amount are required." });
    }

    if (req.user.role === "student" && studentId !== req.user.id) {
      return res.status(403).json({ error: "Students can confirm only their own payment." });
    }

    await connection.beginTransaction();
    const manualReference = `manual_${Date.now()}`;

    const [result] = await connection.query(
      `INSERT INTO payment_receipts
       (student_id, semester_id, amount, status, gateway_provider, gateway_reference, gateway_status, confirmed_at)
       VALUES (?, ?, ?, 'confirmed', 'mock', ?, 'succeeded', NOW())`,
      [studentId, semesterId, amount, manualReference]
    );

    await createNotification(
      connection,
      studentId,
      "payment_confirmation",
      `Payment confirmed: $${amount.toFixed(2)} for semester #${semesterId}.`,
      { paymentReceiptId: result.insertId, semesterId, amount }
    );

    await connection.commit();

    await sendPaymentEmail({
      userId: studentId,
      semesterLabel: `Semester #${semesterId}`,
      amount,
      reference: manualReference
    }).catch(() => null);

    return res.status(201).json({
      message: "Payment confirmation saved.",
      paymentReceiptId: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/registration-open-alert", requireRole("admin"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const message = String(req.body.message || "Registration window is now open.").trim();

    await connection.beginTransaction();
    const [students] = await connection.query("SELECT id FROM users WHERE role = 'student'");

    for (const student of students) {
      await createNotification(
        connection,
        student.id,
        "registration_open",
        message,
        { source: "admin_trigger" }
      );
    }

    await connection.commit();

    for (const student of students) {
      await sendGenericAlertEmail({
        userId: student.id,
        subject: "Registration Open Alert",
        message
      }).catch(() => null);
    }

    return res.json({ message: "Registration open alerts sent to all students." });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/deadline-reminder", requireRole("admin"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const message = String(
      req.body.message || "Reminder: Registration deadline is approaching."
    ).trim();

    await connection.beginTransaction();
    const [students] = await connection.query("SELECT id FROM users WHERE role = 'student'");

    for (const student of students) {
      await createNotification(
        connection,
        student.id,
        "deadline",
        message,
        { source: "admin_trigger" }
      );
    }

    await connection.commit();

    for (const student of students) {
      await sendGenericAlertEmail({
        userId: student.id,
        subject: "Registration Deadline Reminder",
        message
      }).catch(() => null);
    }

    return res.json({ message: "Deadline reminders sent to all students." });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export default router;
