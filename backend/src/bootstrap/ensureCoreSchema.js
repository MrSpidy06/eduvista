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

    await connection.query(`
      INSERT INTO departments (code, name)
      VALUES
        ('CSE', 'Computer Science and Engineering'),
        ('MATH', 'Mathematics'),
        ('AI', 'Artificial Intelligence'),
        ('HUM', 'Humanities')
      ON DUPLICATE KEY UPDATE
        name = VALUES(name)
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
      CREATE TABLE IF NOT EXISTS semesters (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(60) NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        starts_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        registration_starts_at DATETIME NOT NULL,
        registration_ends_at DATETIME NOT NULL,
        add_drop_starts_at DATETIME NOT NULL,
        add_drop_ends_at DATETIME NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing(connection, "semesters", "name", "name VARCHAR(60) NULL");
    await addColumnIfMissing(connection, "semesters", "academic_year", "academic_year VARCHAR(20) NULL");
    await addColumnIfMissing(connection, "semesters", "starts_on", "starts_on DATE NULL");
    await addColumnIfMissing(connection, "semesters", "ends_on", "ends_on DATE NULL");
    await addColumnIfMissing(
      connection,
      "semesters",
      "registration_starts_at",
      "registration_starts_at DATETIME NULL"
    );
    await addColumnIfMissing(
      connection,
      "semesters",
      "registration_ends_at",
      "registration_ends_at DATETIME NULL"
    );
    await addColumnIfMissing(
      connection,
      "semesters",
      "add_drop_starts_at",
      "add_drop_starts_at DATETIME NULL"
    );
    await addColumnIfMissing(
      connection,
      "semesters",
      "add_drop_ends_at",
      "add_drop_ends_at DATETIME NULL"
    );
    await addColumnIfMissing(connection, "semesters", "is_active", "is_active TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfMissing(
      connection,
      "semesters",
      "created_at",
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(20) NULL,
        course_group VARCHAR(20) NULL,
        section_label VARCHAR(20) NOT NULL DEFAULT 'A',
        category VARCHAR(80) NOT NULL DEFAULT 'General',
        title VARCHAR(160) NULL,
        description TEXT NULL,
        credits INT NOT NULL DEFAULT 4,
        is_core TINYINT(1) NOT NULL DEFAULT 0,
        seats_total INT NOT NULL DEFAULT 40,
        seats_available INT NOT NULL DEFAULT 40,
        waitlist_capacity INT NOT NULL DEFAULT 50,
        schedule_block VARCHAR(120) NOT NULL DEFAULT 'Mon/Wed 09:00-10:30',
        prerequisites TEXT NULL,
        department VARCHAR(80) DEFAULT 'General',
        department_id INT NULL,
        semester_id INT NULL,
        faculty_id INT NULL,
        university_id INT NULL,
        location_state VARCHAR(80) NULL,
        location_city VARCHAR(120) NULL,
        delivery_mode VARCHAR(20) NOT NULL DEFAULT 'offline',
        duration_label VARCHAR(60) NULL,
        qualification_required VARCHAR(255) NULL,
        eligible_academic_levels VARCHAR(20) NULL,
        minimum_score_percent DECIMAL(5,2) NULL,
        approx_fee_total VARCHAR(120) NULL,
        application_deadline DATE NULL,
        brochure_path VARCHAR(255) NULL,
        required_documents_intro TEXT NULL,
        min_year_level INT NOT NULL DEFAULT 1,
        min_cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00,
        registration_starts_at DATETIME NULL,
        registration_ends_at DATETIME NULL,
        add_drop_ends_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing(connection, "courses", "code", "code VARCHAR(20) NULL");
    await addColumnIfMissing(connection, "courses", "course_group", "course_group VARCHAR(20) NULL");
    await addColumnIfMissing(
      connection,
      "courses",
      "section_label",
      "section_label VARCHAR(20) NOT NULL DEFAULT 'A'"
    );
    await addColumnIfMissing(connection, "courses", "category", "category VARCHAR(80) NOT NULL DEFAULT 'General'");
    await addColumnIfMissing(connection, "courses", "title", "title VARCHAR(160) NULL");
    await addColumnIfMissing(connection, "courses", "description", "description TEXT NULL");
    await addColumnIfMissing(connection, "courses", "credits", "credits INT NOT NULL DEFAULT 4");
    await addColumnIfMissing(connection, "courses", "is_core", "is_core TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfMissing(connection, "courses", "seats_total", "seats_total INT NOT NULL DEFAULT 40");
    await addColumnIfMissing(
      connection,
      "courses",
      "seats_available",
      "seats_available INT NOT NULL DEFAULT 40"
    );
    await addColumnIfMissing(
      connection,
      "courses",
      "waitlist_capacity",
      "waitlist_capacity INT NOT NULL DEFAULT 50"
    );
    await addColumnIfMissing(
      connection,
      "courses",
      "schedule_block",
      "schedule_block VARCHAR(120) NOT NULL DEFAULT 'Mon/Wed 09:00-10:30'"
    );
    await addColumnIfMissing(connection, "courses", "prerequisites", "prerequisites TEXT NULL");
    await addColumnIfMissing(connection, "courses", "department", "department VARCHAR(80) DEFAULT 'General'");
    await addColumnIfMissing(connection, "courses", "department_id", "department_id INT NULL");
    await addColumnIfMissing(connection, "courses", "semester_id", "semester_id INT NULL");
    await addColumnIfMissing(connection, "courses", "faculty_id", "faculty_id INT NULL");
    await addColumnIfMissing(connection, "courses", "university_id", "university_id INT NULL");
    await addColumnIfMissing(connection, "courses", "location_state", "location_state VARCHAR(80) NULL");
    await addColumnIfMissing(connection, "courses", "location_city", "location_city VARCHAR(120) NULL");
    await addColumnIfMissing(
      connection,
      "courses",
      "delivery_mode",
      "delivery_mode VARCHAR(20) NOT NULL DEFAULT 'offline'"
    );
    await addColumnIfMissing(connection, "courses", "duration_label", "duration_label VARCHAR(60) NULL");
    await addColumnIfMissing(
      connection,
      "courses",
      "qualification_required",
      "qualification_required VARCHAR(255) NULL"
    );
    await addColumnIfMissing(
      connection,
      "courses",
      "eligible_academic_levels",
      "eligible_academic_levels VARCHAR(20) NULL"
    );
    await addColumnIfMissing(
      connection,
      "courses",
      "minimum_score_percent",
      "minimum_score_percent DECIMAL(5,2) NULL"
    );
    await addColumnIfMissing(connection, "courses", "approx_fee_total", "approx_fee_total VARCHAR(120) NULL");
    await addColumnIfMissing(
      connection,
      "courses",
      "application_deadline",
      "application_deadline DATE NULL"
    );
    await addColumnIfMissing(connection, "courses", "brochure_path", "brochure_path VARCHAR(255) NULL");
    await addColumnIfMissing(
      connection,
      "courses",
      "required_documents_intro",
      "required_documents_intro TEXT NULL"
    );
    await addColumnIfMissing(connection, "courses", "min_year_level", "min_year_level INT NOT NULL DEFAULT 1");
    await addColumnIfMissing(connection, "courses", "min_cgpa", "min_cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00");
    await addColumnIfMissing(
      connection,
      "courses",
      "registration_starts_at",
      "registration_starts_at DATETIME NULL"
    );
    await addColumnIfMissing(
      connection,
      "courses",
      "registration_ends_at",
      "registration_ends_at DATETIME NULL"
    );
    await addColumnIfMissing(connection, "courses", "add_drop_ends_at", "add_drop_ends_at DATETIME NULL");
    await addColumnIfMissing(connection, "courses", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

    await connection.query(`
      UPDATE courses
      SET code = COALESCE(NULLIF(code, ''), CONCAT('COURSE-', LPAD(id, 4, '0'))),
          course_group = COALESCE(NULLIF(course_group, ''), COALESCE(NULLIF(code, ''), CONCAT('COURSE-', LPAD(id, 4, '0')))),
          section_label = COALESCE(NULLIF(section_label, ''), 'A'),
          category = COALESCE(NULLIF(category, ''), 'General'),
          delivery_mode = COALESCE(NULLIF(delivery_mode, ''), 'offline'),
          title = COALESCE(NULLIF(title, ''), CONCAT('Course ', id)),
          credits = COALESCE(credits, 4),
          is_core = COALESCE(is_core, 0),
          seats_total = CASE WHEN seats_total IS NULL OR seats_total < 1 THEN 40 ELSE seats_total END,
          seats_available = CASE
            WHEN seats_available IS NULL OR seats_available < 0
            THEN CASE WHEN seats_total IS NULL OR seats_total < 1 THEN 40 ELSE seats_total END
            ELSE seats_available
          END,
          waitlist_capacity = CASE WHEN waitlist_capacity IS NULL OR waitlist_capacity < 0 THEN 50 ELSE waitlist_capacity END,
          schedule_block = COALESCE(NULLIF(schedule_block, ''), 'Mon/Wed 09:00-10:30'),
          department = COALESCE(NULLIF(department, ''), 'General'),
          min_year_level = COALESCE(min_year_level, 1),
          min_cgpa = COALESCE(min_cgpa, 0)
    `);

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

    await addColumnIfMissing(connection, "student_profiles", "user_id", "user_id INT NULL");
    await addColumnIfMissing(connection, "student_profiles", "phone", "phone VARCHAR(30) NULL");
    await addColumnIfMissing(connection, "student_profiles", "academic_level", "academic_level ENUM('10', '12') NULL");
    await addColumnIfMissing(connection, "student_profiles", "date_of_birth", "date_of_birth DATE NULL");
    await addColumnIfMissing(connection, "student_profiles", "gender", "gender VARCHAR(20) NULL");
    await addColumnIfMissing(connection, "student_profiles", "address_line", "address_line VARCHAR(255) NULL");
    await addColumnIfMissing(connection, "student_profiles", "city", "city VARCHAR(120) NULL");
    await addColumnIfMissing(connection, "student_profiles", "state", "state VARCHAR(120) NULL");
    await addColumnIfMissing(connection, "student_profiles", "guardian_name", "guardian_name VARCHAR(120) NULL");
    await addColumnIfMissing(connection, "student_profiles", "guardian_phone", "guardian_phone VARCHAR(30) NULL");
    await addColumnIfMissing(connection, "student_profiles", "school_name", "school_name VARCHAR(160) NULL");
    await addColumnIfMissing(connection, "student_profiles", "board_name", "board_name VARCHAR(120) NULL");
    await addColumnIfMissing(connection, "student_profiles", "stream_name", "stream_name VARCHAR(80) NULL");
    await addColumnIfMissing(connection, "student_profiles", "passing_year", "passing_year INT NULL");
    await addColumnIfMissing(connection, "student_profiles", "score_percent", "score_percent DECIMAL(5,2) NULL");
    await addColumnIfMissing(connection, "student_profiles", "exam_roll_no", "exam_roll_no VARCHAR(80) NULL");
    await addColumnIfMissing(connection, "student_profiles", "target_course", "target_course VARCHAR(160) NULL");
    await addColumnIfMissing(connection, "student_profiles", "marks_summary", "marks_summary VARCHAR(160) NULL");
    await addColumnIfMissing(connection, "student_profiles", "bio", "bio TEXT NULL");
    await addColumnIfMissing(connection, "student_profiles", "avatar_path", "avatar_path VARCHAR(255) NULL");
    await addColumnIfMissing(
      connection,
      "student_profiles",
      "updated_at",
      "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

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

    await addColumnIfMissing(connection, "student_profile_documents", "user_id", "user_id INT NULL");
    await addColumnIfMissing(
      connection,
      "student_profile_documents",
      "document_type",
      "document_type VARCHAR(80) NULL"
    );
    await addColumnIfMissing(
      connection,
      "student_profile_documents",
      "academic_level",
      "academic_level ENUM('10', '12') NULL"
    );
    await addColumnIfMissing(
      connection,
      "student_profile_documents",
      "original_name",
      "original_name VARCHAR(255) NULL"
    );
    await addColumnIfMissing(
      connection,
      "student_profile_documents",
      "stored_name",
      "stored_name VARCHAR(255) NULL"
    );
    await addColumnIfMissing(connection, "student_profile_documents", "file_path", "file_path VARCHAR(255) NULL");
    await addColumnIfMissing(
      connection,
      "student_profile_documents",
      "created_at",
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    );

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

    await addColumnIfMissing(connection, "university_profiles", "user_id", "user_id INT NULL");
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "university_name",
      "university_name VARCHAR(180) NULL"
    );
    await addColumnIfMissing(connection, "university_profiles", "short_name", "short_name VARCHAR(80) NULL");
    await addColumnIfMissing(connection, "university_profiles", "state", "state VARCHAR(120) NULL");
    await addColumnIfMissing(connection, "university_profiles", "city", "city VARCHAR(120) NULL");
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "address_line",
      "address_line VARCHAR(255) NULL"
    );
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "website_url",
      "website_url VARCHAR(255) NULL"
    );
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "contact_email",
      "contact_email VARCHAR(160) NULL"
    );
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "contact_phone",
      "contact_phone VARCHAR(30) NULL"
    );
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "accreditation",
      "accreditation VARCHAR(180) NULL"
    );
    await addColumnIfMissing(connection, "university_profiles", "description", "description TEXT NULL");
    await addColumnIfMissing(connection, "university_profiles", "logo_path", "logo_path VARCHAR(255) NULL");
    await addColumnIfMissing(connection, "university_profiles", "banner_path", "banner_path VARCHAR(255) NULL");
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "application_bar_label",
      "application_bar_label VARCHAR(120) NULL"
    );
    await addColumnIfMissing(
      connection,
      "university_profiles",
      "updated_at",
      "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

    await connection.query(`
      UPDATE university_profiles up
      JOIN users u ON u.id = up.user_id
      SET up.university_name = COALESCE(NULLIF(up.university_name, ''), u.full_name),
          up.contact_email = COALESCE(NULLIF(up.contact_email, ''), u.email)
      WHERE up.user_id IS NOT NULL
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS course_requirements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        course_id INT NOT NULL,
        document_name VARCHAR(160) NOT NULL,
        is_required TINYINT(1) NOT NULL DEFAULT 1,
        instructions VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing(connection, "course_requirements", "course_id", "course_id INT NULL");
    await addColumnIfMissing(connection, "course_requirements", "document_name", "document_name VARCHAR(160) NULL");
    await addColumnIfMissing(connection, "course_requirements", "is_required", "is_required TINYINT(1) NOT NULL DEFAULT 1");
    await addColumnIfMissing(connection, "course_requirements", "instructions", "instructions VARCHAR(255) NULL");
    await addColumnIfMissing(connection, "course_requirements", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS course_applications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        university_id INT NULL,
        status ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected') NOT NULL DEFAULT 'submitted',
        statement TEXT NULL,
        fit_score DECIMAL(5,2) NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing(connection, "course_applications", "student_id", "student_id INT NULL");
    await addColumnIfMissing(connection, "course_applications", "course_id", "course_id INT NULL");
    await addColumnIfMissing(connection, "course_applications", "university_id", "university_id INT NULL");
    await addColumnIfMissing(
      connection,
      "course_applications",
      "status",
      "status ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected') NOT NULL DEFAULT 'submitted'"
    );
    await addColumnIfMissing(connection, "course_applications", "statement", "statement TEXT NULL");
    await addColumnIfMissing(connection, "course_applications", "fit_score", "fit_score DECIMAL(5,2) NULL");
    await addColumnIfMissing(connection, "course_applications", "applied_at", "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    await addColumnIfMissing(
      connection,
      "course_applications",
      "updated_at",
      "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

    await connection.query(`
      UPDATE course_applications ca
      JOIN courses c ON c.id = ca.course_id
      SET ca.university_id = COALESCE(ca.university_id, c.university_id)
      WHERE ca.university_id IS NULL
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS application_documents (
        id INT PRIMARY KEY AUTO_INCREMENT,
        application_id INT NOT NULL,
        requirement_name VARCHAR(160) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing(connection, "application_documents", "application_id", "application_id INT NULL");
    await addColumnIfMissing(
      connection,
      "application_documents",
      "requirement_name",
      "requirement_name VARCHAR(160) NULL"
    );
    await addColumnIfMissing(
      connection,
      "application_documents",
      "original_name",
      "original_name VARCHAR(255) NULL"
    );
    await addColumnIfMissing(
      connection,
      "application_documents",
      "stored_name",
      "stored_name VARCHAR(255) NULL"
    );
    await addColumnIfMissing(connection, "application_documents", "file_path", "file_path VARCHAR(255) NULL");
    await addColumnIfMissing(
      connection,
      "application_documents",
      "uploaded_at",
      "uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    );

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
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // ignore rollback failures for implicit-DDL commits
    }
    throw error;
  } finally {
    connection.release();
  }
};
