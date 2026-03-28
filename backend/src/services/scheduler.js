import cron from "node-cron";
import "../env.js";
import pool from "../db.js";
import {
  createNotification,
  processWaitlistForCourse,
  releaseExpiredSeatHolds
} from "../utils/registration.js";
import { sendGenericAlertEmail } from "./email.js";

const enabled =
  String(process.env.ENABLE_SCHEDULER || "true").toLowerCase() !== "false";

const todayStamp = () => new Date().toISOString().slice(0, 10);

const getDedupSettingKey = (prefix, suffix) => `${prefix}_${suffix}_${todayStamp()}`;

const hasSentToday = async (connection, key) => {
  const [rows] = await connection.query(
    `SELECT setting_value
     FROM system_settings
     WHERE setting_key = ?
     LIMIT 1`,
    [key]
  );
  return rows.length > 0;
};

const markSentToday = async (connection, key) => {
  await connection.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, String(Date.now())]
  );
};

const runSafe = async (name, handler) => {
  try {
    await handler();
  } catch (error) {
    console.error(`[scheduler:${name}]`, error);
  }
};

const processHoldsAndWaitlists = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await releaseExpiredSeatHolds(connection);

    const [courses] = await connection.query(
      `SELECT DISTINCT c.id
       FROM courses c
       JOIN waitlist_entries w ON w.course_id = c.id
       WHERE w.status = 'active'
         AND c.seats_available > 0`
    );

    for (const course of courses) {
      await processWaitlistForCourse(connection, course.id);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const sendRegistrationOpenAlerts = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [semesters] = await connection.query(
      `SELECT id, name, academic_year
       FROM semesters
       WHERE NOW() BETWEEN registration_starts_at AND registration_ends_at`
    );

    if (semesters.length === 0) {
      await connection.commit();
      return;
    }

    const [students] = await connection.query(
      `SELECT id
       FROM users
       WHERE role = 'student'`
    );
    const alertedSemesters = [];

    for (const semester of semesters) {
      const settingKey = getDedupSettingKey("alert_registration_open", semester.id);
      const alreadySent = await hasSentToday(connection, settingKey);
      if (alreadySent) {
        continue;
      }

      const message = `Registration is open for ${semester.name} ${semester.academic_year}.`;

      for (const student of students) {
        await createNotification(
          connection,
          student.id,
          "registration_open",
          message,
          { semesterId: semester.id }
        );
      }

      await markSentToday(connection, settingKey);
      alertedSemesters.push(semester);
    }

    await connection.commit();

    for (const semester of alertedSemesters) {
      const subject = `Registration Open: ${semester.name} ${semester.academic_year}`;
      const message = `Registration is open for ${semester.name} ${semester.academic_year}. Please complete course registration before the deadline.`;

      for (const student of students) {
        await sendGenericAlertEmail({ userId: student.id, subject, message }).catch(
          () => null
        );
      }
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const sendDeadlineReminders = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [semesters] = await connection.query(
      `SELECT id, name, academic_year, registration_ends_at
       FROM semesters
       WHERE registration_ends_at > NOW()
         AND registration_ends_at <= DATE_ADD(NOW(), INTERVAL 48 HOUR)`
    );

    if (semesters.length === 0) {
      await connection.commit();
      return;
    }

    const [students] = await connection.query(
      `SELECT id
       FROM users
       WHERE role = 'student'`
    );
    const alertedSemesters = [];

    for (const semester of semesters) {
      const settingKey = getDedupSettingKey("alert_deadline", semester.id);
      const alreadySent = await hasSentToday(connection, settingKey);
      if (alreadySent) {
        continue;
      }

      const message = `Reminder: Registration for ${semester.name} ${semester.academic_year} closes on ${new Date(
        semester.registration_ends_at
      ).toLocaleString()}.`;

      for (const student of students) {
        await createNotification(
          connection,
          student.id,
          "deadline",
          message,
          { semesterId: semester.id }
        );
      }

      await markSentToday(connection, settingKey);
      alertedSemesters.push(semester);
    }

    await connection.commit();

    for (const semester of alertedSemesters) {
      const subject = `Deadline Reminder: ${semester.name} ${semester.academic_year}`;
      const message = `Registration deadline is approaching (${new Date(
        semester.registration_ends_at
      ).toLocaleString()}). Please finalize your registration.`;

      for (const student of students) {
        await sendGenericAlertEmail({ userId: student.id, subject, message }).catch(
          () => null
        );
      }
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const startSchedulers = () => {
  if (!enabled) {
    console.log("[scheduler] disabled");
    return;
  }

  console.log("[scheduler] enabled");

  cron.schedule("*/2 * * * *", () => {
    runSafe("holds_waitlists", processHoldsAndWaitlists);
  });

  cron.schedule("0 * * * *", () => {
    runSafe("registration_open_alerts", sendRegistrationOpenAlerts);
    runSafe("deadline_reminders", sendDeadlineReminders);
  });
};
