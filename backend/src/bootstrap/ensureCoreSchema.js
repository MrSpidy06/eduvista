import pool from "../db.js";

const tableExists = async (connection, tableName) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.total || 0) > 0;
};

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
};

const addColumnIfMissing = async (connection, tableName, columnName, definition) => {
  const exists = await columnExists(connection, tableName, columnName);
  if (exists) {
    return;
  }
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
};

export const ensureCoreSchema = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const usersExists = await tableExists(connection, "users");
    if (!usersExists) {
      await connection.query(`
        CREATE TABLE users (
          id INT PRIMARY KEY AUTO_INCREMENT,
          full_name VARCHAR(120) NOT NULL,
          email VARCHAR(160) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('student', 'admin', 'faculty', 'advisor', 'university') NOT NULL DEFAULT 'student',
          department_id INT NULL,
          year_level INT NOT NULL DEFAULT 1,
          cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00,
          financial_hold TINYINT(1) NOT NULL DEFAULT 0,
          max_credits INT NOT NULL DEFAULT 24,
          registration_frozen TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await connection.query(`
        ALTER TABLE users
        MODIFY COLUMN role ENUM('student', 'admin', 'faculty', 'advisor', 'institution', 'university') NOT NULL DEFAULT 'student'
      `);
      await connection.query(`
        UPDATE users
        SET role = 'university'
        WHERE role = 'institution'
      `);
      await connection.query(`
        ALTER TABLE users
        MODIFY COLUMN role ENUM('student', 'admin', 'faculty', 'advisor', 'university') NOT NULL DEFAULT 'student'
      `);

      await addColumnIfMissing(connection, "users", "password_hash", "password_hash VARCHAR(255) NULL");
      await addColumnIfMissing(connection, "users", "department_id", "department_id INT NULL");
      await addColumnIfMissing(connection, "users", "year_level", "year_level INT NOT NULL DEFAULT 1");
      await addColumnIfMissing(connection, "users", "cgpa", "cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00");
      await addColumnIfMissing(connection, "users", "financial_hold", "financial_hold TINYINT(1) NOT NULL DEFAULT 0");
      await addColumnIfMissing(connection, "users", "max_credits", "max_credits INT NOT NULL DEFAULT 24");
      await addColumnIfMissing(
        connection,
        "users",
        "registration_frozen",
        "registration_frozen TINYINT(1) NOT NULL DEFAULT 0"
      );

      if (await columnExists(connection, "users", "password")) {
        await connection.query(`
          UPDATE users
          SET password_hash = COALESCE(NULLIF(password_hash, ''), password)
          WHERE (password_hash IS NULL OR password_hash = '')
            AND password IS NOT NULL
        `);
        await connection.query(`
          ALTER TABLE users
          MODIFY COLUMN password VARCHAR(255) NULL
        `);
      }

      if (await columnExists(connection, "users", "created_at")) {
        await connection.query(`
          UPDATE users
          SET created_at = COALESCE(created_at, NOW())
        `);
        await connection.query(`
          ALTER TABLE users
          MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        `);
      }

      if (await columnExists(connection, "users", "updated_at")) {
        await connection.query(`
          UPDATE users
          SET updated_at = COALESCE(updated_at, NOW())
        `);
        await connection.query(`
          ALTER TABLE users
          MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        `);
      }
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_profiles (
        user_id INT PRIMARY KEY,
        phone VARCHAR(30) NULL,
        academic_level ENUM('10', '12') NULL,
        date_of_birth DATE NULL,
        gender VARCHAR(20) NULL,
        address_line VARCHAR(255) NULL,
        city VARCHAR(120) NULL,
        state VARCHAR(120) NULL,
        guardian_name VARCHAR(120) NULL,
        guardian_phone VARCHAR(30) NULL,
        school_name VARCHAR(160) NULL,
        board_name VARCHAR(120) NULL,
        stream_name VARCHAR(80) NULL,
        passing_year INT NULL,
        score_percent DECIMAL(5,2) NULL,
        exam_roll_no VARCHAR(80) NULL,
        target_course VARCHAR(160) NULL,
        marks_summary VARCHAR(160) NULL,
        bio TEXT NULL,
        avatar_path VARCHAR(255) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await addColumnIfMissing(connection, "student_profiles", "academic_level", "academic_level ENUM('10', '12') NULL");
    await addColumnIfMissing(connection, "student_profiles", "board_name", "board_name VARCHAR(120) NULL");
    await addColumnIfMissing(connection, "student_profiles", "stream_name", "stream_name VARCHAR(80) NULL");
    await addColumnIfMissing(connection, "student_profiles", "passing_year", "passing_year INT NULL");
    await addColumnIfMissing(connection, "student_profiles", "score_percent", "score_percent DECIMAL(5,2) NULL");
    await addColumnIfMissing(connection, "student_profiles", "exam_roll_no", "exam_roll_no VARCHAR(80) NULL");
    await addColumnIfMissing(connection, "student_profiles", "target_course", "target_course VARCHAR(160) NULL");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_profile_documents (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        document_type VARCHAR(80) NOT NULL,
        academic_level ENUM('10', '12') NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_student_profile_documents_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS university_profiles (
        user_id INT PRIMARY KEY,
        university_name VARCHAR(180) NOT NULL,
        short_name VARCHAR(80) NULL,
        state VARCHAR(120) NULL,
        city VARCHAR(120) NULL,
        address_line VARCHAR(255) NULL,
        website_url VARCHAR(255) NULL,
        contact_email VARCHAR(160) NULL,
        contact_phone VARCHAR(30) NULL,
        accreditation VARCHAR(180) NULL,
        description TEXT NULL,
        logo_path VARCHAR(255) NULL,
        banner_path VARCHAR(255) NULL,
        application_bar_label VARCHAR(120) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS session_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        jti VARCHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        user_agent VARCHAR(255) NULL,
        ip_address VARCHAR(80) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_tokens_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        category ENUM('registration_open', 'deadline', 'seat_available', 'registration_confirmation', 'payment_confirmation', 'announcement', 'waitlist_update') NOT NULL,
        message VARCHAR(255) NOT NULL,
        meta_json JSON NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(160) NOT NULL,
        body TEXT NOT NULL,
        target_role ENUM('all', 'student', 'faculty', 'admin', 'university') NOT NULL DEFAULT 'all',
        posted_by INT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_announcement_title (title),
        FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(160) PRIMARY KEY,
        setting_value TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } finally {
    connection.release();
  }
};
