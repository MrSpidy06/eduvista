import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import "../env.js";
import pool from "../db.js";
import { createUploader, toPublicUploadPath } from "../middleware/upload.js";
import { buildUniversityProfileComplete } from "../utils/admissions.js";
import {
  issueAuthToken,
  requireAuth,
  requireRole,
  revokeSessionByJti
} from "../middleware/auth.js";

const router = Router();
const CAPTCHA_TTL_MINUTES = Number(process.env.CAPTCHA_TTL_MINUTES || 5);
const SELF_SERVICE_ROLES = new Set(["student", "university"]);
const getCaptchaSecret = () => process.env.CAPTCHA_SECRET || process.env.JWT_SECRET || "dev-captcha-secret";
const studentDocumentUpload = createUploader("student-profile-documents");

const buildStudentProfileComplete = (user) =>
  Boolean(
    user.student_phone &&
      user.guardian_phone &&
      user.academic_level &&
      user.student_city &&
      user.student_state &&
      user.board_name &&
      user.school_name &&
      user.score_percent !== null &&
      user.score_percent !== undefined &&
      Number(user.student_document_count || 0) > 0
  );

const buildCaptcha = () => {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const operators = ["+", "-"];
  const op = operators[Math.floor(Math.random() * operators.length)];
  return {
    a,
    b,
    op,
    question: `${a} ${op} ${b} = ?`,
    answer: String(op === "+" ? a + b : a - b)
  };
};

const signCaptchaToken = (payload) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getCaptchaSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const readCaptchaPayload = (token) => {
  if (!token || !String(token).includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = String(token).split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", getCaptchaSecret())
    .update(encodedPayload)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!parsed?.a || !parsed?.b || !parsed?.op || !parsed?.exp) {
      return null;
    }
    if (Number(parsed.exp) < Date.now()) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
};

router.get("/captcha", (_req, res) => {
  const captcha = buildCaptcha();
  const expiresAt = Date.now() + CAPTCHA_TTL_MINUTES * 60 * 1000;
  const captchaId = signCaptchaToken({
    a: captcha.a,
    b: captcha.b,
    op: captcha.op,
    exp: expiresAt,
    nonce: crypto.randomUUID()
  });

  return res.json({
    captchaId,
    question: captcha.question,
    expiresInSeconds: CAPTCHA_TTL_MINUTES * 60
  });
});

router.get("/signup-meta", async (_req, res, next) => {
  try {
    const [departments] = await pool.query(
      "SELECT id, code, name FROM departments ORDER BY name ASC"
    );
    return res.json({
      departments,
      accountTypes: ["student", "university"],
      academicLevels: ["10", "12"]
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/signup", async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      yearLevel,
      cgpa,
      departmentId,
      accountType,
      universityName,
      academicLevel,
      phone,
      guardianPhone
    } = req.body;
    const role = String(accountType || "student").trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (!SELF_SERVICE_ROLES.has(role)) {
      return res.status(400).json({ error: "Invalid account type." });
    }

    if (role === "student") {
      if (!["10", "12"].includes(String(academicLevel || "").trim())) {
        return res.status(400).json({ error: "Academic level must be 10 or 12." });
      }

      if (!String(phone || "").trim() || !String(guardianPhone || "").trim()) {
        return res.status(400).json({
          error: "Student phone and parent phone are required."
        });
      }
    }

    if (role === "university" && !String(universityName || "").trim()) {
      return res.status(400).json({ error: "University name is required." });
    }

    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Password must have at least 6 characters." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const resolvedFullName =
      String(fullName || "")
        .trim() ||
      normalizedEmail
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()) ||
      "Student";
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [
      normalizedEmail
    ]);

    if (existing.length > 0) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const sanitizedYear = Number(yearLevel) || 1;
    const sanitizedCgpa = Number(cgpa) || 0;

    const connection = await pool.getConnection();
    let result;
    try {
      await connection.beginTransaction();

      [result] = await connection.query(
        `INSERT INTO users
         (full_name, email, password_hash, role, department_id, year_level, cgpa)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedFullName,
          normalizedEmail,
          passwordHash,
          role,
          Number(departmentId) || null,
          role === "student" ? Number(academicLevel) || Math.max(1, sanitizedYear) : 1,
          role === "student" ? Math.max(0, Math.min(4, sanitizedCgpa)) : 0
        ]
      );

      if (role === "student") {
        await connection.query(
          `INSERT INTO student_profiles (user_id, academic_level, phone, guardian_phone)
           VALUES (?, ?, ?, ?)`,
          [
            result.insertId,
            String(academicLevel).trim(),
            String(phone).trim(),
            String(guardianPhone).trim()
          ]
        );
      }

      if (role === "university") {
        await connection.query(
          `INSERT INTO university_profiles
             (user_id, university_name, contact_email)
           VALUES (?, ?, ?)`,
          [result.insertId, String(universityName).trim(), normalizedEmail]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const user = {
      id: result.insertId,
      role
    };

    const auth = await issueAuthToken({
      user,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip
    });

    return res.status(201).json({
      token: auth.token,
      expiresAt: auth.expiresAt,
      user: {
        id: result.insertId,
        name: resolvedFullName,
        email: normalizedEmail,
        role,
        yearLevel: role === "student" ? Number(academicLevel) || Math.max(1, sanitizedYear) : 1,
        cgpa: role === "student" ? Math.max(0, Math.min(4, sanitizedCgpa)) : 0,
        universityName: role === "university" ? String(universityName).trim() : null,
        academicLevel: role === "student" ? String(academicLevel).trim() : null,
        phone: role === "student" ? String(phone).trim() : null,
        guardianPhone: role === "student" ? String(guardianPhone).trim() : null,
        profileComplete: false
      }
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Email is already registered." });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.role,
              u.financial_hold, u.max_credits, u.year_level, u.cgpa,
              d.id AS department_id, d.name AS department_name,
              sp.phone AS student_phone,
              sp.guardian_phone,
              sp.academic_level,
              sp.city AS student_city,
              sp.state AS student_state,
              sp.board_name,
              sp.school_name,
              sp.score_percent,
              up.university_name,
              up.city AS university_city,
              up.state AS university_state,
              up.contact_email AS university_contact_email,
              up.contact_phone AS university_contact_phone,
              up.description AS university_description,
              (
                SELECT COUNT(*)
                FROM student_profile_documents spd
                WHERE spd.user_id = u.id
              ) AS student_document_count
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN university_profiles up ON up.user_id = u.id
       WHERE u.email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const matches = await bcrypt.compare(String(password), user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const auth = await issueAuthToken({
      user,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip
    });

    return res.json({
      token: auth.token,
      expiresAt: auth.expiresAt,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        financialHold: Boolean(user.financial_hold),
        maxCredits: Number(user.max_credits),
        yearLevel: Number(user.year_level),
        cgpa: Number(user.cgpa),
        departmentId: user.department_id,
        departmentName: user.department_name || null,
        academicLevel: user.academic_level || null,
        phone: user.student_phone || null,
        guardianPhone: user.guardian_phone || null,
        universityName: user.university_name || null,
        profileComplete:
          user.role === "student"
            ? buildStudentProfileComplete(user)
            : user.role === "university"
              ? buildUniversityProfileComplete(user)
              : true
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await revokeSessionByJti(req.user.jti);
    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role,
              u.financial_hold, u.max_credits, u.year_level, u.cgpa,
              u.registration_frozen,
              d.id AS department_id, d.name AS department_name,
              sp.phone AS student_phone,
              sp.guardian_phone,
              sp.academic_level,
              sp.city AS student_city,
              sp.state AS student_state,
              sp.board_name,
              sp.school_name,
              sp.score_percent,
              up.university_name,
              up.city AS university_city,
              up.state AS university_state,
              up.contact_email AS university_contact_email,
              up.contact_phone AS university_contact_phone,
              up.description AS university_description,
              up.logo_path,
              up.banner_path,
              (
                SELECT COUNT(*)
                FROM student_profile_documents spd
                WHERE spd.user_id = u.id
              ) AS student_document_count
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN university_profiles up ON up.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        financialHold: Boolean(user.financial_hold),
        maxCredits: Number(user.max_credits),
        yearLevel: Number(user.year_level),
        cgpa: Number(user.cgpa),
        registrationFrozen: Boolean(user.registration_frozen),
        departmentId: user.department_id,
        departmentName: user.department_name || null,
        universityName: user.university_name || null,
        academicLevel: user.academic_level || null,
        phone: user.student_phone || null,
        guardianPhone: user.guardian_phone || null,
        profileComplete:
          user.role === "student"
            ? buildStudentProfileComplete(user)
            : user.role === "university"
              ? buildUniversityProfileComplete(user)
              : true,
        logoPath: user.logo_path || null,
        bannerPath: user.banner_path || null
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === "student") {
      const [rows] = await pool.query(
        `SELECT u.full_name, u.email, u.department_id, u.year_level, u.cgpa,
                sp.phone, sp.guardian_phone, sp.academic_level,
                sp.date_of_birth, sp.gender, sp.address_line,
                sp.city, sp.state, sp.guardian_name, sp.guardian_phone,
                sp.school_name, sp.board_name, sp.stream_name, sp.passing_year,
                sp.score_percent, sp.exam_roll_no, sp.target_course,
                sp.marks_summary, sp.bio, sp.avatar_path
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = ?`,
        [req.user.id]
      );
      const [documents] = await pool.query(
        `SELECT id, document_type, academic_level, original_name, file_path, created_at
         FROM student_profile_documents
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.id]
      );
      return res.json({ profile: rows[0] || null, documents });
    }

    if (req.user.role === "university") {
      const [rows] = await pool.query(
        `SELECT u.full_name, u.email, u.department_id,
                up.university_name, up.short_name, up.state, up.city,
                up.address_line, up.website_url, up.contact_email, up.contact_phone,
                up.accreditation, up.description, up.logo_path, up.banner_path,
                up.application_bar_label
         FROM users u
         LEFT JOIN university_profiles up ON up.user_id = u.id
         WHERE u.id = ?`,
        [req.user.id]
      );
      return res.json({ profile: rows[0] || null });
    }

    return res.json({ profile: null });
  } catch (error) {
    return next(error);
  }
});

router.put("/profile", requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (req.user.role === "student") {
      const {
        fullName,
        departmentId,
        yearLevel,
        cgpa,
        phone,
        academicLevel,
        dateOfBirth,
        gender,
        addressLine,
        city,
        state,
        guardianName,
        guardianPhone,
        schoolName,
        boardName,
        streamName,
        passingYear,
        scorePercent,
        examRollNo,
        targetCourse,
        marksSummary,
        bio,
        avatarPath
      } = req.body;

      await connection.query(
        `UPDATE users
         SET full_name = ?, department_id = ?, year_level = ?, cgpa = ?
         WHERE id = ?`,
        [
          String(fullName || "").trim(),
          Number(departmentId) || null,
          Math.max(1, Number(yearLevel) || 1),
          Math.max(0, Math.min(4, Number(cgpa) || 0)),
          req.user.id
        ]
      );

      await connection.query(
        `INSERT INTO student_profiles
           (user_id, phone, date_of_birth, gender, address_line, city, state,
            guardian_name, guardian_phone, school_name, board_name, stream_name,
            passing_year, score_percent, exam_roll_no, target_course,
            academic_level, marks_summary, bio, avatar_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           phone = VALUES(phone),
           date_of_birth = VALUES(date_of_birth),
           gender = VALUES(gender),
           address_line = VALUES(address_line),
           city = VALUES(city),
           state = VALUES(state),
           guardian_name = VALUES(guardian_name),
           guardian_phone = VALUES(guardian_phone),
           school_name = VALUES(school_name),
           board_name = VALUES(board_name),
           stream_name = VALUES(stream_name),
           passing_year = VALUES(passing_year),
           score_percent = VALUES(score_percent),
           exam_roll_no = VALUES(exam_roll_no),
           target_course = VALUES(target_course),
           academic_level = VALUES(academic_level),
           marks_summary = VALUES(marks_summary),
           bio = VALUES(bio),
           avatar_path = VALUES(avatar_path)`,
        [
          req.user.id,
          phone || null,
          dateOfBirth || null,
          gender || null,
          addressLine || null,
          city || null,
          state || null,
          guardianName || null,
          guardianPhone || null,
          schoolName || null,
          boardName || null,
          streamName || null,
          Number(passingYear) || null,
          scorePercent === "" || scorePercent === null || scorePercent === undefined
            ? null
            : Number(scorePercent),
          examRollNo || null,
          targetCourse || null,
          academicLevel || null,
          marksSummary || null,
          bio || null,
          avatarPath || null
        ]
      );
    } else if (req.user.role === "university") {
      const {
        fullName,
        departmentId,
        universityName,
        shortName,
        state,
        city,
        addressLine,
        websiteUrl,
        contactEmail,
        contactPhone,
        accreditation,
        description,
        logoPath,
        bannerPath,
        applicationBarLabel
      } = req.body;

      await connection.query(
        `UPDATE users
         SET full_name = ?, department_id = ?
         WHERE id = ?`,
        [String(fullName || "").trim(), Number(departmentId) || null, req.user.id]
      );

      await connection.query(
        `INSERT INTO university_profiles
           (user_id, university_name, short_name, state, city, address_line,
            website_url, contact_email, contact_phone, accreditation, description,
            logo_path, banner_path, application_bar_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           university_name = VALUES(university_name),
           short_name = VALUES(short_name),
           state = VALUES(state),
           city = VALUES(city),
           address_line = VALUES(address_line),
           website_url = VALUES(website_url),
           contact_email = VALUES(contact_email),
           contact_phone = VALUES(contact_phone),
           accreditation = VALUES(accreditation),
           description = VALUES(description),
           logo_path = VALUES(logo_path),
           banner_path = VALUES(banner_path),
           application_bar_label = VALUES(application_bar_label)`,
        [
          req.user.id,
          String(universityName || "").trim(),
          shortName || null,
          state || null,
          city || null,
          addressLine || null,
          websiteUrl || null,
          contactEmail || null,
          contactPhone || null,
          accreditation || null,
          description || null,
          logoPath || null,
          bannerPath || null,
          applicationBarLabel || null
        ]
      );
    }

    await connection.commit();
    return res.json({ message: "Profile updated successfully." });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post(
  "/profile/documents",
  requireAuth,
  requireRole("student"),
  studentDocumentUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Document file is required." });
      }

      const documentType = String(req.body.documentType || "other").trim();
      const academicLevel = String(req.body.academicLevel || "").trim() || null;

      const [result] = await pool.query(
        `INSERT INTO student_profile_documents
           (user_id, document_type, academic_level, original_name, stored_name, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          documentType,
          academicLevel,
          req.file.originalname,
          req.file.filename,
          toPublicUploadPath(req.file)
        ]
      );

      return res.status(201).json({
        document: {
          id: result.insertId,
          document_type: documentType,
          academic_level: academicLevel,
          original_name: req.file.originalname,
          file_path: toPublicUploadPath(req.file)
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete("/profile/documents/:id", requireAuth, requireRole("student"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid document id." });
    }

    const [result] = await pool.query(
      `DELETE FROM student_profile_documents
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Document not found." });
    }

    return res.json({ message: "Document removed." });
  } catch (error) {
    return next(error);
  }
});

export default router;
