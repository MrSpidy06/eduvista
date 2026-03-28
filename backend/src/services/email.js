import nodemailer from "nodemailer";
import pool from "../db.js";

let transporter = null;
let transporterReady = false;

const getMailConfig = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM || "no-reply@eduvista.local"
});

const isConfigured = () => {
  const cfg = getMailConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass);
};

const getTransporter = async () => {
  if (transporterReady) {
    return transporter;
  }

  if (!isConfigured()) {
    transporterReady = true;
    transporter = null;
    return transporter;
  }

  const cfg = getMailConfig();
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });

  await transporter.verify();
  transporterReady = true;
  return transporter;
};

export const sendEmail = async ({ to, subject, text, html }) => {
  if (!to || !subject) {
    return { sent: false, reason: "missing_parameters" };
  }

  const cfg = getMailConfig();
  const tx = await getTransporter();

  if (!tx) {
    console.log(`[MAIL-SKIP] To:${to} | Subject:${subject} | ${text || ""}`);
    return { sent: false, reason: "not_configured" };
  }

  const info = await tx.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html
  });

  return { sent: true, messageId: info.messageId };
};

const readUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, full_name, email
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

export const sendEmailToUser = async ({
  userId,
  subject,
  text,
  html
}) => {
  const user = await readUser(userId);
  if (!user?.email) {
    return { sent: false, reason: "user_email_not_found" };
  }

  return sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
};

export const sendRegistrationEmail = async ({
  userId,
  courseCode,
  courseTitle,
  semesterLabel,
  status
}) => {
  const subject = `EduVista Registration ${String(status || "update").toUpperCase()} - ${courseCode}`;
  const text = [
    "Your registration update from EduVista:",
    `Course: ${courseCode} - ${courseTitle}`,
    semesterLabel ? `Semester: ${semesterLabel}` : null,
    `Status: ${status}`,
    "Please check your dashboard for complete details."
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmailToUser({ userId, subject, text });
};

export const sendPaymentEmail = async ({
  userId,
  semesterLabel,
  amount,
  reference
}) => {
  const numericAmount = Number(amount || 0);
  const subject = `EduVista Payment Confirmation - $${numericAmount.toFixed(2)}`;
  const text = [
    "Your payment has been confirmed.",
    semesterLabel ? `Semester: ${semesterLabel}` : null,
    `Amount: $${numericAmount.toFixed(2)}`,
    reference ? `Reference: ${reference}` : null,
    "Thank you for completing your registration payment."
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmailToUser({ userId, subject, text });
};

export const sendGenericAlertEmail = async ({ userId, subject, message }) =>
  sendEmailToUser({ userId, subject, text: message });
