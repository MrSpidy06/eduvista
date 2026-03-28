import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { createNotification } from "../utils/registration.js";
import {
  createGatewayIntent,
  getPaymentProvider,
  verifyGatewayPayment
} from "../services/payment.js";
import { sendPaymentEmail } from "../services/email.js";

const router = Router();

router.use(requireAuth);

router.get("/my", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.student_id, p.semester_id, p.amount, p.status,
              p.gateway_provider, p.gateway_reference, p.gateway_status,
              p.confirmed_at, p.created_at,
              s.name AS semester_name, s.academic_year
       FROM payment_receipts p
       LEFT JOIN semesters s ON s.id = p.semester_id
       WHERE p.student_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return res.json({ payments: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/intent", async (req, res, next) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    const semesterId = Number(req.body.semesterId);
    const amount = Number(req.body.amount);
    const currency = String(req.body.currency || "usd").toLowerCase();

    if (!Number.isInteger(semesterId) || semesterId <= 0) {
      return res.status(400).json({ error: "Valid semesterId is required." });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }

    const [semesterRows] = await connection.query(
      `SELECT id, name, academic_year
       FROM semesters
       WHERE id = ?
       LIMIT 1`,
      [semesterId]
    );

    const semester = semesterRows[0];
    if (!semester) {
      return res.status(404).json({ error: "Semester not found." });
    }

    const intent = await createGatewayIntent({
      amount,
      currency,
      metadata: {
        studentId: String(req.user.id),
        semesterId: String(semesterId)
      }
    });

    await connection.beginTransaction();
    transactionStarted = true;

    const [result] = await connection.query(
      `INSERT INTO payment_receipts
       (student_id, semester_id, amount, status, gateway_provider, gateway_reference, gateway_status, confirmed_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, NULL)`,
      [
        req.user.id,
        semesterId,
        amount,
        intent.provider,
        intent.gatewayReference,
        intent.status
      ]
    );

    await createNotification(
      connection,
      req.user.id,
      "payment_confirmation",
      `Payment initiated for ${semester.name} ${semester.academic_year}. Pending confirmation.`,
      {
        paymentReceiptId: result.insertId,
        gatewayProvider: intent.provider,
        amount,
        semesterId
      }
    );

    await connection.commit();

    return res.status(201).json({
      paymentReceiptId: result.insertId,
      provider: intent.provider,
      gatewayReference: intent.gatewayReference,
      clientSecret: intent.clientSecret,
      status: intent.status,
      amount,
      currency,
      semester: {
        id: semester.id,
        name: semester.name,
        academicYear: semester.academic_year
      }
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/confirm", async (req, res, next) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    const paymentReceiptId = Number(req.body.paymentReceiptId);
    const gatewayReference = req.body.gatewayReference
      ? String(req.body.gatewayReference)
      : null;

    if (!Number.isInteger(paymentReceiptId) || paymentReceiptId <= 0) {
      return res.status(400).json({ error: "Valid paymentReceiptId is required." });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      `SELECT p.id, p.student_id, p.semester_id, p.amount, p.status,
              p.gateway_provider, p.gateway_reference,
              s.name AS semester_name, s.academic_year
       FROM payment_receipts p
       LEFT JOIN semesters s ON s.id = p.semester_id
       WHERE p.id = ?
       LIMIT 1
       FOR UPDATE`,
      [paymentReceiptId]
    );

    const receipt = rows[0];
    if (!receipt) {
      await connection.rollback();
      return res.status(404).json({ error: "Payment receipt not found." });
    }

    if (receipt.student_id !== req.user.id && req.user.role !== "admin") {
      await connection.rollback();
      return res.status(403).json({ error: "Not allowed to confirm this payment." });
    }

    if (receipt.status === "confirmed") {
      await connection.commit();
      return res.json({
        message: "Payment already confirmed.",
        paymentReceiptId: receipt.id
      });
    }

    const referenceToVerify = gatewayReference || receipt.gateway_reference;
    const verification = await verifyGatewayPayment({
      gatewayReference: referenceToVerify
    });

    if (!verification.ok) {
      await connection.query(
        `UPDATE payment_receipts
         SET gateway_status = ?
         WHERE id = ?`,
        [verification.status, receipt.id]
      );

      await connection.commit();

      return res.status(409).json({
        error: "Payment not yet successful at gateway.",
        gatewayStatus: verification.status,
        provider: verification.provider
      });
    }

    await connection.query(
      `UPDATE payment_receipts
       SET status = 'confirmed',
           confirmed_at = NOW(),
           gateway_provider = ?,
           gateway_reference = ?,
           gateway_status = ?
       WHERE id = ?`,
      [verification.provider, referenceToVerify, verification.status, receipt.id]
    );

    await createNotification(
      connection,
      receipt.student_id,
      "payment_confirmation",
      `Payment confirmed for ${receipt.semester_name || "selected semester"} (${receipt.academic_year || ""}).`,
      {
        paymentReceiptId: receipt.id,
        reference: referenceToVerify,
        amount: receipt.amount,
        provider: verification.provider
      }
    );

    await connection.commit();

    await sendPaymentEmail({
      userId: receipt.student_id,
      semesterLabel: receipt.semester_name
        ? `${receipt.semester_name} ${receipt.academic_year}`
        : null,
      amount: receipt.amount,
      reference: referenceToVerify
    }).catch(() => null);

    return res.json({
      message: "Payment confirmed successfully.",
      paymentReceiptId: receipt.id,
      provider: verification.provider,
      gatewayStatus: verification.status
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/provider", (_req, res) => {
  res.json({ provider: getPaymentProvider() });
});

export default router;
