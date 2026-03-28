import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createNotification, getRegistrationFrozen } from "../utils/registration.js";

const router = Router();

const escapeCsv = (value) => {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const buildCsv = (columns, rows) => {
  const header = columns.map((col) => escapeCsv(col.label)).join(",");
  const body = rows.map((row) => columns.map((col) => escapeCsv(row[col.key])).join(","));
  return [header, ...body].join("\n");
};

const buildSimplePdf = (title, lines) => {
  const escape = (text) => String(text).replace(/([\\()])/g, "\\$1");
  const contentLines = [
    `BT /F1 16 Tf 50 760 Td (${escape(title)}) Tj ET`,
    ...lines.slice(0, 34).map((line, index) => {
      const y = 730 - index * 20;
      return `BT /F1 11 Tf 50 ${y} Td (${escape(line)}) Tj ET`;
    })
  ];
  const stream = contentLines.join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"
  ];

  const header = "%PDF-1.4\n";
  const offsets = [];
  let current = Buffer.byteLength(header, "utf8");
  const body = objects
    .map((object) => {
      offsets.push(current);
      const chunk = `${object}\n`;
      current += Buffer.byteLength(chunk, "utf8");
      return chunk;
    })
    .join("");

  const xrefStart = current;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
  ].join("\n");

  const trailer = [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    `${xrefStart}`,
    "%%EOF"
  ].join("\n");

  return Buffer.from(`${header}${body}${xref}\n${trailer}`, "utf8");
};

router.use(requireAuth);
router.use(requireRole("admin"));

router.get("/users", async (req, res, next) => {
  try {
    const roleFilter = req.query.role ? String(req.query.role) : null;
    const params = [];
    let query = `SELECT u.id, u.full_name, u.email, u.role, u.year_level, u.cgpa,
                        d.name AS department_name
                 FROM users u
                 LEFT JOIN departments d ON d.id = u.department_id`;

    if (roleFilter) {
      query += " WHERE u.role = ?";
      params.push(roleFilter);
    }

    query += " ORDER BY u.full_name ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ users: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/departments", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, code, name, created_at FROM departments ORDER BY name ASC"
    );
    return res.json({ departments: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/departments", async (req, res, next) => {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    const name = String(req.body.name || "").trim();

    if (!code || !name) {
      return res.status(400).json({ error: "code and name are required." });
    }

    const [result] = await pool.query(
      "INSERT INTO departments (code, name) VALUES (?, ?)",
      [code, name]
    );

    return res.status(201).json({ departmentId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Department code already exists." });
    }
    return next(error);
  }
});

router.put("/departments/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid department id." });
    }

    const code = String(req.body.code || "").trim().toUpperCase();
    const name = String(req.body.name || "").trim();
    if (!code || !name) {
      return res.status(400).json({ error: "code and name are required." });
    }

    const [result] = await pool.query(
      "UPDATE departments SET code = ?, name = ? WHERE id = ?",
      [code, name, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Department not found." });
    }

    return res.json({ message: "Department updated." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Department code already exists." });
    }
    return next(error);
  }
});

router.delete("/departments/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid department id." });
    }

    const [result] = await pool.query("DELETE FROM departments WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Department not found." });
    }

    return res.json({ message: "Department removed." });
  } catch (error) {
    return next(error);
  }
});

router.get("/semesters", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, academic_year, starts_on, ends_on,
              registration_starts_at, registration_ends_at,
              add_drop_starts_at, add_drop_ends_at,
              is_active
       FROM semesters
       ORDER BY starts_on DESC`
    );
    return res.json({ semesters: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/semesters", async (req, res, next) => {
  try {
    const {
      name,
      academicYear,
      startsOn,
      endsOn,
      registrationStartsAt,
      registrationEndsAt,
      addDropStartsAt,
      addDropEndsAt,
      isActive
    } = req.body;

    if (
      !name ||
      !academicYear ||
      !startsOn ||
      !endsOn ||
      !registrationStartsAt ||
      !registrationEndsAt ||
      !addDropStartsAt ||
      !addDropEndsAt
    ) {
      return res.status(400).json({ error: "All semester fields are required." });
    }

    const [result] = await pool.query(
      `INSERT INTO semesters
       (name, academic_year, starts_on, ends_on,
        registration_starts_at, registration_ends_at,
        add_drop_starts_at, add_drop_ends_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        String(academicYear).trim(),
        startsOn,
        endsOn,
        registrationStartsAt,
        registrationEndsAt,
        addDropStartsAt,
        addDropEndsAt,
        isActive ? 1 : 0
      ]
    );

    if (isActive) {
      await pool.query("UPDATE semesters SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END", [
        result.insertId
      ]);
    }

    return res.status(201).json({ semesterId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Semester already exists." });
    }
    return next(error);
  }
});

router.put("/semesters/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid semester id." });
    }

    const {
      name,
      academicYear,
      startsOn,
      endsOn,
      registrationStartsAt,
      registrationEndsAt,
      addDropStartsAt,
      addDropEndsAt,
      isActive
    } = req.body;

    const [result] = await pool.query(
      `UPDATE semesters
       SET name = ?,
           academic_year = ?,
           starts_on = ?,
           ends_on = ?,
           registration_starts_at = ?,
           registration_ends_at = ?,
           add_drop_starts_at = ?,
           add_drop_ends_at = ?,
           is_active = ?
       WHERE id = ?`,
      [
        String(name || "").trim(),
        String(academicYear || "").trim(),
        startsOn,
        endsOn,
        registrationStartsAt,
        registrationEndsAt,
        addDropStartsAt,
        addDropEndsAt,
        isActive ? 1 : 0,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Semester not found." });
    }

    if (isActive) {
      await pool.query("UPDATE semesters SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END", [
        id
      ]);
    }

    return res.json({ message: "Semester updated." });
  } catch (error) {
    return next(error);
  }
});

router.get("/courses", async (req, res, next) => {
  try {
    const semesterId = Number(req.query.semesterId) || null;
    const params = [];
    let filter = "";

    if (semesterId) {
      filter = "WHERE c.semester_id = ?";
      params.push(semesterId);
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.course_group, c.section_label, c.title, c.description,
              c.credits, c.is_core, c.seats_total, c.seats_available, c.waitlist_capacity,
              c.schedule_block, c.prerequisites, c.min_year_level, c.min_cgpa, c.faculty_id,
              d.name AS department_name,
              s.name AS semester_name, s.academic_year,
              faculty.full_name AS faculty_name
       FROM courses c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN semesters s ON s.id = c.semester_id
       LEFT JOIN users faculty ON faculty.id = c.faculty_id
       ${filter}
       ORDER BY c.semester_id DESC, c.course_group ASC, c.section_label ASC`,
      params
    );

    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/courses", async (req, res, next) => {
  try {
    const {
      code,
      courseGroup,
      section,
      title,
      description,
      credits,
      isCore,
      seatsTotal,
      seatsAvailable,
      waitlistCapacity,
      scheduleBlock,
      prerequisites,
      departmentId,
      semesterId,
      facultyId,
      minYearLevel,
      minCgpa,
      registrationStartsAt,
      registrationEndsAt,
      addDropEndsAt
    } = req.body;

    if (!code || !title || !credits || !seatsTotal || !scheduleBlock || !semesterId) {
      return res.status(400).json({
        error: "code, title, credits, seatsTotal, scheduleBlock, and semesterId are required."
      });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const group = String(courseGroup || normalizedCode.split("-")[0]).trim().toUpperCase();
    const sectionLabel = String(section || normalizedCode.split("-")[1] || "A")
      .trim()
      .toUpperCase();

    const [result] = await pool.query(
      `INSERT INTO courses
       (code, course_group, section_label, title, description,
        credits, is_core, seats_total, seats_available, waitlist_capacity,
        schedule_block, prerequisites, department_id, semester_id, faculty_id,
        min_year_level, min_cgpa, registration_starts_at, registration_ends_at, add_drop_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCode,
        group,
        sectionLabel,
        String(title).trim(),
        description || null,
        Number(credits),
        isCore ? 1 : 0,
        Number(seatsTotal),
        Number.isFinite(Number(seatsAvailable)) ? Number(seatsAvailable) : Number(seatsTotal),
        Number(waitlistCapacity || 50),
        String(scheduleBlock).trim(),
        prerequisites || null,
        Number(departmentId) || null,
        Number(semesterId),
        Number(facultyId) || null,
        Number(minYearLevel || 1),
        Number(minCgpa || 0),
        registrationStartsAt || null,
        registrationEndsAt || null,
        addDropEndsAt || null
      ]
    );

    return res.status(201).json({ courseId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Course code already exists." });
    }
    return next(error);
  }
});

router.put("/courses/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid course id." });
    }

    const {
      title,
      description,
      credits,
      isCore,
      seatsTotal,
      seatsAvailable,
      waitlistCapacity,
      scheduleBlock,
      prerequisites,
      departmentId,
      semesterId,
      facultyId,
      minYearLevel,
      minCgpa,
      registrationStartsAt,
      registrationEndsAt,
      addDropEndsAt
    } = req.body;

    const [result] = await pool.query(
      `UPDATE courses
       SET title = ?,
           description = ?,
           credits = ?,
           is_core = ?,
           seats_total = ?,
           seats_available = ?,
           waitlist_capacity = ?,
           schedule_block = ?,
           prerequisites = ?,
           department_id = ?,
           semester_id = ?,
           faculty_id = ?,
           min_year_level = ?,
           min_cgpa = ?,
           registration_starts_at = ?,
           registration_ends_at = ?,
           add_drop_ends_at = ?
       WHERE id = ?`,
      [
        String(title || "").trim(),
        description || null,
        Number(credits),
        isCore ? 1 : 0,
        Number(seatsTotal),
        Number(seatsAvailable),
        Number(waitlistCapacity || 50),
        String(scheduleBlock || "").trim(),
        prerequisites || null,
        Number(departmentId) || null,
        Number(semesterId) || null,
        Number(facultyId) || null,
        Number(minYearLevel || 1),
        Number(minCgpa || 0),
        registrationStartsAt || null,
        registrationEndsAt || null,
        addDropEndsAt || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Course not found." });
    }

    return res.json({ message: "Course updated." });
  } catch (error) {
    return next(error);
  }
});

router.delete("/courses/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid course id." });
    }

    const [result] = await pool.query("DELETE FROM courses WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Course not found." });
    }

    return res.json({ message: "Course removed." });
  } catch (error) {
    return next(error);
  }
});

router.patch("/courses/:id/seat-limit", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const seatsTotal = Number(req.body.seatsTotal);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(seatsTotal) || seatsTotal <= 0) {
      return res.status(400).json({ error: "Valid course id and seatsTotal are required." });
    }

    const [result] = await pool.query(
      `UPDATE courses
       SET seats_total = ?,
           seats_available = LEAST(?, seats_available)
       WHERE id = ?`,
      [seatsTotal, seatsTotal, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Course not found." });
    }

    return res.json({ message: "Seat limit updated." });
  } catch (error) {
    return next(error);
  }
});

router.patch("/courses/:id/assign-faculty", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const facultyId = Number(req.body.facultyId);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: "Valid course id and facultyId are required." });
    }

    const [[faculty]] = await pool.query(
      "SELECT id FROM users WHERE id = ? AND role = 'faculty'",
      [facultyId]
    );
    if (!faculty) {
      return res.status(404).json({ error: "Faculty user not found." });
    }

    const [result] = await pool.query("UPDATE courses SET faculty_id = ? WHERE id = ?", [
      facultyId,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Course not found." });
    }

    return res.json({ message: "Faculty assigned to course." });
  } catch (error) {
    return next(error);
  }
});

router.post("/courses/bulk-register-core", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const semesterId = Number(req.body.semesterId);
    const departmentId = Number(req.body.departmentId) || null;
    const minYearLevel = Number(req.body.minYearLevel) || 1;

    if (!Number.isInteger(semesterId) || semesterId <= 0) {
      return res.status(400).json({ error: "Valid semesterId is required." });
    }

    await connection.beginTransaction();

    const studentParams = [minYearLevel];
    let studentFilter = "WHERE role = 'student' AND year_level >= ?";
    if (departmentId) {
      studentFilter += " AND department_id = ?";
      studentParams.push(departmentId);
    }

    const [students] = await connection.query(
      `SELECT id FROM users ${studentFilter}`,
      studentParams
    );

    const courseParams = [semesterId];
    let courseFilter = "WHERE semester_id = ? AND is_core = 1";
    if (departmentId) {
      courseFilter += " AND department_id = ?";
      courseParams.push(departmentId);
    }

    const [courses] = await connection.query(
      `SELECT id, code, title, seats_available
       FROM courses
       ${courseFilter}
       ORDER BY code ASC
       FOR UPDATE`,
      courseParams
    );

    let totalRegistered = 0;

    for (const course of courses) {
      let remainingSeats = Number(course.seats_available);
      if (remainingSeats <= 0) {
        continue;
      }

      for (const student of students) {
        if (remainingSeats <= 0) {
          break;
        }

        const [existing] = await connection.query(
          `SELECT id, status
           FROM enrollments
           WHERE student_id = ? AND course_id = ?
           LIMIT 1`,
          [student.id, course.id]
        );

        if (existing.length > 0 && ["registered", "approved", "pending"].includes(existing[0].status)) {
          continue;
        }

        await connection.query(
          `INSERT INTO enrollments (student_id, course_id, semester_id, status, source)
           VALUES (?, ?, ?, 'registered', 'bulk')
           ON DUPLICATE KEY UPDATE
             status = 'registered',
             source = 'bulk',
             semester_id = VALUES(semester_id),
             updated_at = CURRENT_TIMESTAMP`,
          [student.id, course.id, semesterId]
        );

        await createNotification(
          connection,
          student.id,
          "registration_confirmation",
          `Bulk core registration completed for ${course.code} (${course.title}).`,
          { courseId: course.id, source: "bulk" }
        );

        totalRegistered += 1;
        remainingSeats -= 1;
      }

      const seatsConsumed = Number(course.seats_available) - remainingSeats;
      if (seatsConsumed > 0) {
        await connection.query(
          `UPDATE courses
           SET seats_available = GREATEST(0, seats_available - ?)
           WHERE id = ?`,
          [seatsConsumed, course.id]
        );
      }
    }

    await connection.commit();

    return res.json({
      message: "Bulk core registration completed.",
      totalRegistered
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/registration/freeze", async (req, res, next) => {
  try {
    const frozen = Boolean(req.body.frozen);
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('registration_frozen', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [frozen ? "1" : "0"]
    );

    return res.json({
      message: frozen
        ? "Registration is now frozen."
        : "Registration has been unfrozen.",
      frozen
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/registration/freeze", async (_req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const frozen = await getRegistrationFrozen(connection);
    return res.json({ frozen });
  } catch (error) {
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/announcements", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    const targetRole = String(req.body.targetRole || "all").trim().toLowerCase();

    if (!title || !body) {
      return res.status(400).json({ error: "title and body are required." });
    }

    if (!["all", "student", "faculty", "admin", "university"].includes(targetRole)) {
      return res.status(400).json({ error: "targetRole is invalid." });
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO announcements (title, body, target_role, posted_by, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         body = VALUES(body),
         target_role = VALUES(target_role),
         posted_by = VALUES(posted_by),
         is_active = 1`,
      [title, body, targetRole, req.user.id]
    );

    const [users] = await connection.query(
      `SELECT id
       FROM users
       WHERE ? = 'all' OR role = ?`,
      [targetRole, targetRole]
    );

    for (const user of users) {
      await createNotification(
        connection,
        user.id,
        "announcement",
        `${title}: ${body}`,
        { announcementId: result.insertId || null }
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: "Announcement published.",
      announcementId: result.insertId || null
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/announcements", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.body, a.target_role, a.is_active, a.created_at,
              u.full_name AS posted_by_name
       FROM announcements a
       JOIN users u ON u.id = a.posted_by
       ORDER BY a.created_at DESC`
    );

    return res.json({ announcements: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/requests", async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const params = [];
    let filter = "";

    if (status) {
      filter = "WHERE r.status = ?";
      params.push(status);
    }

    const [rows] = await pool.query(
      `SELECT r.id, r.request_type, r.reason, r.status, r.created_at, r.updated_at,
              student.full_name AS student_name, student.email AS student_email,
              c.code AS course_code, c.title AS course_title,
              advisor.full_name AS advisor_name,
              admin.full_name AS admin_name
       FROM registration_requests r
       JOIN users student ON student.id = r.student_id
       LEFT JOIN courses c ON c.id = r.course_id
       LEFT JOIN users advisor ON advisor.id = r.advisor_id
       LEFT JOIN users admin ON admin.id = r.admin_id
       ${filter}
       ORDER BY r.updated_at DESC`,
      params
    );

    return res.json({ requests: rows });
  } catch (error) {
    return next(error);
  }
});

router.patch("/requests/:id", async (req, res, next) => {
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

    const nextStatus = action === "approve" ? "admin_approved" : "rejected";

    await connection.query(
      `UPDATE registration_requests
       SET status = ?, admin_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextStatus, req.user.id, id]
    );

    await createNotification(
      connection,
      request.student_id,
      "announcement",
      `Your ${request.request_type.replace("_", " ")} request has been ${
        action === "approve" ? "approved" : "rejected"
      } by admin.`,
      { requestId: id, status: nextStatus }
    );

    await connection.commit();

    return res.json({ message: `Request ${action}d successfully.`, status: nextStatus });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/analytics/overview", async (_req, res, next) => {
  try {
    const [[users]] = await pool.query(
      `SELECT
         SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
         SUM(CASE WHEN role = 'university' THEN 1 ELSE 0 END) AS universities,
         SUM(CASE WHEN role = 'faculty' THEN 1 ELSE 0 END) AS faculty,
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
       FROM users`
    );

    const [[courses]] = await pool.query("SELECT COUNT(*) AS total FROM courses");
    const [[enrollments]] = await pool.query(
      `SELECT
         SUM(CASE WHEN status IN ('registered', 'approved', 'pending') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlisted,
         SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) AS dropped
       FROM enrollments`
    );

    return res.json({
      totals: {
        students: Number(users.students || 0),
        universities: Number(users.universities || 0),
        faculty: Number(users.faculty || 0),
        admins: Number(users.admins || 0),
        courses: Number(courses.total || 0),
        activeEnrollments: Number(enrollments.active || 0),
        waitlisted: Number(enrollments.waitlisted || 0),
        dropped: Number(enrollments.dropped || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/analytics/departments", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.code, d.name,
              COUNT(DISTINCT c.id) AS course_count,
              COUNT(DISTINCT CASE
                WHEN e.status IN ('registered', 'approved', 'pending') THEN e.id
                ELSE NULL
              END) AS active_enrollments
       FROM departments d
       LEFT JOIN courses c ON c.department_id = d.id
       LEFT JOIN enrollments e ON e.course_id = c.id
       GROUP BY d.id, d.code, d.name
       ORDER BY active_enrollments DESC, d.name ASC`
    );

    return res.json({ report: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/analytics/popular-courses", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.title,
              COUNT(CASE WHEN e.status IN ('registered', 'approved', 'pending') THEN 1 END) AS active_enrollments,
              COUNT(CASE WHEN w.status = 'active' THEN 1 END) AS waitlist_count,
              COALESCE(ROUND(AVG(cr.rating), 2), 0) AS avg_rating
       FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id
       LEFT JOIN waitlist_entries w ON w.course_id = c.id
       LEFT JOIN course_reviews cr ON cr.course_id = c.id
       GROUP BY c.id, c.code, c.title
       ORDER BY active_enrollments DESC, waitlist_count DESC
       LIMIT 20`
    );

    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/analytics/trends", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(enrolled_at, '%Y-%m') AS month,
              COUNT(*) AS registrations,
              SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlisted
       FROM enrollments
       GROUP BY DATE_FORMAT(enrolled_at, '%Y-%m')
       ORDER BY month ASC`
    );

    return res.json({ trends: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/reports/export", async (req, res, next) => {
  try {
    const format = String(req.query.format || "excel").toLowerCase();

    const [rows] = await pool.query(
      `SELECT d.name AS department,
              c.code,
              c.title,
              COUNT(CASE WHEN e.status IN ('registered', 'approved', 'pending') THEN 1 END) AS active_enrollments,
              COUNT(CASE WHEN e.status = 'waitlisted' THEN 1 END) AS waitlisted,
              COALESCE(ROUND(AVG(cr.rating), 2), 0) AS avg_rating
       FROM courses c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN enrollments e ON e.course_id = c.id
       LEFT JOIN course_reviews cr ON cr.course_id = c.id
       GROUP BY d.name, c.code, c.title
       ORDER BY active_enrollments DESC, c.code ASC`
    );

    if (format === "excel") {
      const csv = buildCsv(
        [
          { label: "Department", key: "department" },
          { label: "Course Code", key: "code" },
          { label: "Course Title", key: "title" },
          { label: "Active Enrollments", key: "active_enrollments" },
          { label: "Waitlisted", key: "waitlisted" },
          { label: "Average Rating", key: "avg_rating" }
        ],
        rows
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="eduvista-report-${Date.now()}.csv"`
      );
      return res.send(csv);
    }

    if (format === "pdf") {
      const lines = rows.slice(0, 30).map(
        (row) =>
          `${row.code} | Enrolled: ${row.active_enrollments} | Waitlist: ${row.waitlisted} | Rating: ${row.avg_rating}`
      );
      const pdfBuffer = buildSimplePdf("EduVista Enrollment Report", lines);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="eduvista-report-${Date.now()}.pdf"`
      );
      return res.send(pdfBuffer);
    }

    return res.status(400).json({ error: "Unsupported format. Use excel or pdf." });
  } catch (error) {
    return next(error);
  }
});

export default router;
