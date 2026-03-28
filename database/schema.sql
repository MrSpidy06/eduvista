CREATE DATABASE IF NOT EXISTS eduvista;
USE eduvista;

CREATE TABLE IF NOT EXISTS departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_semester_name (name, academic_year)
);

CREATE TABLE IF NOT EXISTS users (
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_department (department_id),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,
  course_group VARCHAR(20) NOT NULL,
  section_label VARCHAR(20) NOT NULL DEFAULT 'A',
  category VARCHAR(80) NOT NULL DEFAULT 'General',
  title VARCHAR(160) NOT NULL,
  description TEXT,
  credits INT NOT NULL,
  is_core TINYINT(1) NOT NULL DEFAULT 0,
  seats_total INT NOT NULL,
  seats_available INT NOT NULL,
  waitlist_capacity INT NOT NULL DEFAULT 50,
  schedule_block VARCHAR(120) NOT NULL,
  prerequisites TEXT,
  department VARCHAR(80) DEFAULT 'General',
  department_id INT NULL,
  semester_id INT NULL,
  faculty_id INT NULL,
  university_id INT NULL,
  location_state VARCHAR(80) NULL,
  location_city VARCHAR(120) NULL,
  duration_label VARCHAR(60) NULL,
  qualification_required VARCHAR(255) NULL,
  approx_fee_total VARCHAR(120) NULL,
  application_deadline DATE NULL,
  brochure_path VARCHAR(255) NULL,
  required_documents_intro TEXT NULL,
  min_year_level INT NOT NULL DEFAULT 1,
  min_cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  registration_starts_at DATETIME NULL,
  registration_ends_at DATETIME NULL,
  add_drop_ends_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_courses_group (course_group),
  INDEX idx_courses_department (department_id),
  INDEX idx_courses_semester (semester_id),
  INDEX idx_courses_faculty (faculty_id),
  INDEX idx_courses_university (university_id),
  CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_courses_semester FOREIGN KEY (semester_id) REFERENCES semesters(id),
  CONSTRAINT fk_courses_faculty FOREIGN KEY (faculty_id) REFERENCES users(id),
  CONSTRAINT fk_courses_university FOREIGN KEY (university_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  semester_id INT NULL,
  status ENUM('pending', 'registered', 'waitlisted', 'approved', 'rejected', 'dropped') NOT NULL DEFAULT 'registered',
  source ENUM('direct', 'waitlist_auto', 'switch', 'bulk', 'admin') NOT NULL DEFAULT 'direct',
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_enrollment (student_id, course_id),
  INDEX idx_enrollments_student (student_id),
  INDEX idx_enrollments_course (course_id),
  INDEX idx_enrollments_status (status),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_semester FOREIGN KEY (semester_id) REFERENCES semesters(id)
);

CREATE TABLE IF NOT EXISTS completed_courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  course_code VARCHAR(20) NOT NULL,
  completed_at DATE,
  UNIQUE KEY unique_completed_course (student_id, course_code),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registration_phases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  semester_id INT NOT NULL,
  phase_name VARCHAR(80) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  min_year_level INT NOT NULL DEFAULT 1,
  min_cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_phase_per_semester (semester_id, phase_name),
  INDEX idx_registration_phases_semester (semester_id),
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seat_holds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  hold_reference VARCHAR(64) NOT NULL UNIQUE,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  status ENUM('active', 'released', 'converted', 'expired') NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seat_holds_student (student_id),
  INDEX idx_seat_holds_course (course_id),
  INDEX idx_seat_holds_expiry (expires_at),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  semester_id INT NULL,
  position_no INT NOT NULL,
  status ENUM('active', 'auto_enrolled', 'cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_active_waitlist (student_id, course_id),
  INDEX idx_waitlist_course_position (course_id, position_no),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_waitlist_semester FOREIGN KEY (semester_id) REFERENCES semesters(id)
);

CREATE TABLE IF NOT EXISTS enrollment_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  enrollment_id INT NULL,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  action_type ENUM('preview', 'hold', 'register', 'waitlist', 'auto_enroll', 'drop', 'switch', 'approve', 'reject') NOT NULL,
  note VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_enrollment_history_student (student_id),
  INDEX idx_enrollment_history_course (course_id),
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registration_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  course_id INT NULL,
  request_type ENUM('credit_overload', 'prerequisite_override') NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending', 'advisor_approved', 'admin_approved', 'rejected') NOT NULL DEFAULT 'pending',
  advisor_id INT NULL,
  admin_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_requests_student (student_id),
  INDEX idx_requests_status (status),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  category ENUM('registration_open', 'deadline', 'seat_available', 'registration_confirmation', 'payment_confirmation', 'announcement', 'waitlist_update') NOT NULL,
  message VARCHAR(255) NOT NULL,
  meta_json JSON NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id),
  INDEX idx_notifications_read (is_read),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS course_reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  student_id INT NOT NULL,
  rating TINYINT NOT NULL,
  review_text TEXT,
  faculty_feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_course_review (course_id, student_id),
  INDEX idx_course_reviews_course (course_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  semester_id INT NOT NULL,
  status ENUM('planned', 'completed', 'dropped') NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_plan (student_id, course_id, semester_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS course_requirements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  document_name VARCHAR(160) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  instructions VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_course_requirement (course_id, document_name),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  university_id INT NOT NULL,
  status ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected') NOT NULL DEFAULT 'submitted',
  statement TEXT NULL,
  fit_score DECIMAL(5,2) NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_course_application (student_id, course_id),
  INDEX idx_course_applications_student (student_id),
  INDEX idx_course_applications_course (course_id),
  INDEX idx_course_applications_university (university_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_documents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  application_id INT NOT NULL,
  requirement_name VARCHAR(160) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES course_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  semester_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'confirmed') NOT NULL DEFAULT 'pending',
  gateway_provider ENUM('mock', 'stripe') NOT NULL DEFAULT 'mock',
  gateway_reference VARCHAR(120) NULL,
  gateway_status VARCHAR(40) NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  jti VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_tokens_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS captcha_challenges (
  id VARCHAR(64) PRIMARY KEY,
  question VARCHAR(64) NOT NULL,
  answer VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE users
  MODIFY COLUMN role ENUM('student', 'admin', 'faculty', 'advisor', 'institution', 'university') NOT NULL DEFAULT 'student';

UPDATE users
SET role = 'university'
WHERE role = 'institution';

ALTER TABLE users
  MODIFY COLUMN role ENUM('student', 'admin', 'faculty', 'advisor', 'university') NOT NULL DEFAULT 'student';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS department_id INT NULL,
  ADD COLUMN IF NOT EXISTS year_level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS financial_hold TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_credits INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS registration_frozen TINYINT(1) NOT NULL DEFAULT 0;

SET @has_legacy_password := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'password'
);

SET @copy_legacy_password_sql := IF(
  @has_legacy_password > 0,
  'UPDATE users
   SET password_hash = COALESCE(NULLIF(password_hash, ''''''), password)
   WHERE (password_hash IS NULL OR password_hash = '''''')
     AND password IS NOT NULL',
  'SELECT 1'
);

PREPARE copy_legacy_password_stmt FROM @copy_legacy_password_sql;
EXECUTE copy_legacy_password_stmt;
DEALLOCATE PREPARE copy_legacy_password_stmt;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS course_group VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS section_label VARCHAR(20) NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS is_core TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waitlist_capacity INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS department_id INT NULL,
  ADD COLUMN IF NOT EXISTS semester_id INT NULL,
  ADD COLUMN IF NOT EXISTS faculty_id INT NULL,
  ADD COLUMN IF NOT EXISTS university_id INT NULL,
  ADD COLUMN IF NOT EXISTS location_state VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS location_city VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS duration_label VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS qualification_required VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS approx_fee_total VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS application_deadline DATE NULL,
  ADD COLUMN IF NOT EXISTS brochure_path VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS required_documents_intro TEXT NULL,
  ADD COLUMN IF NOT EXISTS min_year_level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_cgpa DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS registration_starts_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS registration_ends_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS add_drop_ends_at DATETIME NULL;

ALTER TABLE enrollments
  MODIFY COLUMN status ENUM('pending', 'registered', 'waitlisted', 'approved', 'rejected', 'dropped') NOT NULL DEFAULT 'registered';

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS semester_id INT NULL,
  ADD COLUMN IF NOT EXISTS source ENUM('direct', 'waitlist_auto', 'switch', 'bulk', 'admin') NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS gateway_provider ENUM('mock', 'stripe') NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS gateway_reference VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS gateway_status VARCHAR(40) NULL;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS academic_level ENUM('10', '12') NULL,
  ADD COLUMN IF NOT EXISTS board_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS stream_name VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS passing_year INT NULL,
  ADD COLUMN IF NOT EXISTS score_percent DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS exam_roll_no VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS target_course VARCHAR(160) NULL;

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
);

UPDATE courses
SET course_group = COALESCE(NULLIF(course_group, ''), SUBSTRING_INDEX(code, '-', 1));

INSERT INTO departments (code, name)
VALUES
  ('CSE', 'Computer Science and Engineering'),
  ('MATH', 'Mathematics'),
  ('AI', 'Artificial Intelligence'),
  ('HUM', 'Humanities')
ON DUPLICATE KEY UPDATE
  name = VALUES(name);

INSERT INTO semesters (
  name,
  academic_year,
  starts_on,
  ends_on,
  registration_starts_at,
  registration_ends_at,
  add_drop_starts_at,
  add_drop_ends_at,
  is_active
)
VALUES
  ('Spring', '2026', '2026-01-10', '2026-05-15', '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-01-10 00:00:00', '2026-02-28 23:59:59', 1),
  ('Fall', '2026', '2026-08-10', '2026-12-20', '2026-07-10 09:00:00', '2026-09-01 23:59:59', '2026-08-10 00:00:00', '2026-09-10 23:59:59', 0)
ON DUPLICATE KEY UPDATE
  starts_on = VALUES(starts_on),
  ends_on = VALUES(ends_on),
  registration_starts_at = VALUES(registration_starts_at),
  registration_ends_at = VALUES(registration_ends_at),
  add_drop_starts_at = VALUES(add_drop_starts_at),
  add_drop_ends_at = VALUES(add_drop_ends_at),
  is_active = VALUES(is_active);

SET @cse_id = (SELECT id FROM departments WHERE code = 'CSE' LIMIT 1);
SET @math_id = (SELECT id FROM departments WHERE code = 'MATH' LIMIT 1);
SET @ai_id = (SELECT id FROM departments WHERE code = 'AI' LIMIT 1);
SET @hum_id = (SELECT id FROM departments WHERE code = 'HUM' LIMIT 1);
SET @spring_sem = (SELECT id FROM semesters WHERE name = 'Spring' AND academic_year = '2026' LIMIT 1);
SET @fall_sem = (SELECT id FROM semesters WHERE name = 'Fall' AND academic_year = '2026' LIMIT 1);

INSERT INTO users (
  full_name,
  email,
  password_hash,
  role,
  department_id,
  year_level,
  cgpa,
  max_credits,
  financial_hold
)
VALUES
  ('Demo Student', 'student@eduvista.com', '$2a$10$CRYrBx7haJqRfguNm6GxQepW4ODvNWm96F3cfhWDfoC2dyI.3.Y7C', 'student', @cse_id, 3, 3.45, 24, 0),
  ('Second Student', 'student2@eduvista.com', '$2a$10$CRYrBx7haJqRfguNm6GxQepW4ODvNWm96F3cfhWDfoC2dyI.3.Y7C', 'student', @cse_id, 2, 3.10, 22, 0),
  ('System Admin', 'admin@eduvista.com', '$2a$10$ykJQXmKIaceJ1VaIsVDQX.95dgixisPq27QEcSPGn7jiggHmQ5AOi', 'admin', @cse_id, 4, 3.80, 30, 0),
  ('College of Engineering Trivandrum', 'university@eduvista.com', '$2a$10$ykJQXmKIaceJ1VaIsVDQX.95dgixisPq27QEcSPGn7jiggHmQ5AOi', 'university', @cse_id, 1, 0.00, 30, 0),
  ('Faculty Mentor', 'faculty@eduvista.com', '$2a$10$ykJQXmKIaceJ1VaIsVDQX.95dgixisPq27QEcSPGn7jiggHmQ5AOi', 'faculty', @cse_id, 4, 3.90, 30, 0),
  ('Academic Advisor', 'advisor@eduvista.com', '$2a$10$ykJQXmKIaceJ1VaIsVDQX.95dgixisPq27QEcSPGn7jiggHmQ5AOi', 'advisor', @cse_id, 4, 3.85, 30, 0)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  role = VALUES(role),
  department_id = VALUES(department_id),
  year_level = VALUES(year_level),
  cgpa = VALUES(cgpa),
  max_credits = VALUES(max_credits),
  financial_hold = VALUES(financial_hold);

SET @faculty_id = (SELECT id FROM users WHERE email = 'faculty@eduvista.com' LIMIT 1);
SET @university_id = (SELECT id FROM users WHERE email = 'university@eduvista.com' LIMIT 1);

INSERT INTO university_profiles (
  user_id,
  university_name,
  short_name,
  state,
  city,
  address_line,
  website_url,
  contact_email,
  contact_phone,
  accreditation,
  description,
  application_bar_label
)
VALUES
  (@university_id, 'College of Engineering Trivandrum', 'CET', 'Kerala', 'Trivandrum', 'Engineering College P.O., Sreekaryam', 'https://www.cet.ac.in', 'admissions@cet.eduvista.com', '+91 471 251 5502', 'NBA Accredited', 'Historic engineering college with strong placement, labs, clubs, and applied learning tracks.', 'Upload marksheets, ID proof, entrance score card, and statement of purpose')
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
  application_bar_label = VALUES(application_bar_label);

INSERT INTO courses (
  code,
  course_group,
  section_label,
  category,
  title,
  description,
  credits,
  is_core,
  seats_total,
  seats_available,
  waitlist_capacity,
  schedule_block,
  prerequisites,
  department,
  department_id,
  semester_id,
  faculty_id,
  university_id,
  location_state,
  location_city,
  duration_label,
  qualification_required,
  approx_fee_total,
  application_deadline,
  required_documents_intro,
  min_year_level,
  min_cgpa,
  registration_starts_at,
  registration_ends_at,
  add_drop_ends_at
)
VALUES
  ('CET-CSE-A', 'CET-CSE', 'A', 'Engineering', 'BTech - Computer Science & Engineering', 'Industry-focused undergraduate engineering program covering systems, software, AI foundations, and internship-led learning.', 4, 1, 40, 40, 30, 'Mon/Wed 09:00-10:30', '', 'Computer Science', @cse_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 50%, KEAM', 'INR 85,600 - 1.71 Lakh total', '2026-05-30', 'Upload 10th/12th marksheets, KEAM score card, photo ID, transfer certificate, and SOP.', 1, 0.00, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-ECE-A', 'CET-ECE', 'A', 'Engineering', 'BTech - Electronics & Communication Engineering', 'Hardware and communication systems program with signal processing, embedded systems, and lab-intensive learning.', 4, 1, 35, 35, 25, 'Tue/Thu 08:30-10:00', '', 'Computer Science', @cse_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 50%, KEAM', 'INR 85,600 - 1.71 Lakh total', '2026-05-30', 'Upload marksheets, KEAM score card, conduct certificate, and ID proof.', 1, 0.00, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-MECH-A', 'CET-MECH', 'A', 'Engineering', 'BTech - Mechanical Engineering', 'Program focused on mechanics, thermodynamics, manufacturing, and design studio work.', 4, 1, 35, 35, 25, 'Tue/Thu 10:30-11:45', '', 'Computer Science', @cse_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 50%, KEAM', 'INR 85,600 - 1.71 Lakh total', '2026-05-30', 'Upload marksheets, entrance exam score, and identity proof.', 1, 0.00, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-CIVIL-A', 'CET-CIVIL', 'A', 'Engineering', 'BTech - Civil Engineering', 'Covers structural systems, surveying, transportation, sustainability, and field projects.', 4, 1, 35, 35, 25, 'Mon/Wed 11:00-12:30', '', 'Mathematics', @math_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 50%, KEAM', 'INR 85,600 - 1.71 Lakh total', '2026-05-30', 'Upload academic certificates, entrance score card, and community certificate if applicable.', 1, 0.00, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-DS-A', 'CET-DS', 'A', 'Engineering', 'BTech - Data Science', 'Advanced data-driven engineering track with statistics, ML, data systems, and capstone work.', 4, 0, 30, 30, 20, 'Tue/Thu 09:00-10:15', '', 'Computer Science', @cse_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 60%, KEAM/JEE Main', 'INR 1.20 Lakh total', '2026-05-30', 'Upload marksheets, score card, resume, and SOP.', 2, 2.50, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-AI-A', 'CET-AI', 'A', 'Engineering', 'BTech - Artificial Intelligence', 'AI-first program across machine learning, vision, NLP, ethics, and production systems.', 4, 0, 30, 30, 20, 'Mon/Wed 16:00-17:15', '', 'Artificial Intelligence', @ai_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 60%, KEAM/JEE Main', 'INR 1.35 Lakh total', '2026-05-30', 'Upload marksheets, score card, coding portfolio if available, and SOP.', 2, 2.50, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-DB-A', 'CET-DB', 'A', 'Engineering', 'BTech - Database Systems', 'Specialization in databases, distributed systems, transactions, analytics, and cloud data platforms.', 4, 1, 30, 30, 20, 'Tue/Thu 13:00-14:15', '', 'Computer Science', @cse_id, @spring_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 55%, KEAM', 'INR 1.05 Lakh total', '2026-05-30', 'Upload marksheets, KEAM rank card, and identity proof.', 2, 2.50, '2025-12-20 09:00:00', '2026-02-20 23:59:59', '2026-02-28 23:59:59'),
  ('CET-CLOUD-A', 'CET-CLOUD', 'A', 'Engineering', 'BTech - Cloud Infrastructure', 'Cloud-native engineering track with DevOps, networking, containers, and platform operations.', 4, 0, 25, 25, 20, 'Tue/Thu 14:30-15:45', '', 'Computer Science', @cse_id, @fall_sem, @faculty_id, @university_id, 'Kerala', 'Trivandrum', '4 Years', '10+2 PCM 55%, KEAM/JEE Main', 'INR 1.10 Lakh total', '2026-08-25', 'Upload marksheets, entrance score, and statement of purpose.', 4, 3.20, '2026-07-10 09:00:00', '2026-09-01 23:59:59', '2026-09-10 23:59:59')
ON DUPLICATE KEY UPDATE
  course_group = VALUES(course_group),
  section_label = VALUES(section_label),
  category = VALUES(category),
  title = VALUES(title),
  description = VALUES(description),
  credits = VALUES(credits),
  is_core = VALUES(is_core),
  seats_total = VALUES(seats_total),
  seats_available = VALUES(seats_available),
  waitlist_capacity = VALUES(waitlist_capacity),
  schedule_block = VALUES(schedule_block),
  prerequisites = VALUES(prerequisites),
  department = VALUES(department),
  department_id = VALUES(department_id),
  semester_id = VALUES(semester_id),
  faculty_id = VALUES(faculty_id),
  university_id = VALUES(university_id),
  location_state = VALUES(location_state),
  location_city = VALUES(location_city),
  duration_label = VALUES(duration_label),
  qualification_required = VALUES(qualification_required),
  approx_fee_total = VALUES(approx_fee_total),
  application_deadline = VALUES(application_deadline),
  required_documents_intro = VALUES(required_documents_intro),
  min_year_level = VALUES(min_year_level),
  min_cgpa = VALUES(min_cgpa),
  registration_starts_at = VALUES(registration_starts_at),
  registration_ends_at = VALUES(registration_ends_at),
  add_drop_ends_at = VALUES(add_drop_ends_at);

INSERT INTO registration_phases (
  semester_id,
  phase_name,
  starts_at,
  ends_at,
  min_year_level,
  min_cgpa
)
VALUES
  (@spring_sem, 'Priority Registration', '2026-01-01 09:00:00', '2026-01-07 23:59:59', 4, 3.40),
  (@spring_sem, 'General Registration', '2026-01-08 09:00:00', '2026-02-20 23:59:59', 1, 0.00),
  (@spring_sem, 'Late Add/Drop', '2026-02-21 09:00:00', '2026-02-28 23:59:59', 1, 0.00),
  (@fall_sem, 'Priority Registration', '2026-07-10 09:00:00', '2026-07-15 23:59:59', 4, 3.40),
  (@fall_sem, 'General Registration', '2026-07-16 09:00:00', '2026-09-01 23:59:59', 1, 0.00)
ON DUPLICATE KEY UPDATE
  starts_at = VALUES(starts_at),
  ends_at = VALUES(ends_at),
  min_year_level = VALUES(min_year_level),
  min_cgpa = VALUES(min_cgpa);

INSERT INTO completed_courses (student_id, course_code, completed_at)
SELECT id, 'CS101', CURDATE() FROM users WHERE email = 'student@eduvista.com'
ON DUPLICATE KEY UPDATE
  completed_at = VALUES(completed_at);

INSERT INTO completed_courses (student_id, course_code, completed_at)
SELECT id, 'MA101', CURDATE() FROM users WHERE email = 'student@eduvista.com'
ON DUPLICATE KEY UPDATE
  completed_at = VALUES(completed_at);

INSERT INTO student_profiles (
  user_id,
  phone,
  academic_level,
  date_of_birth,
  gender,
  address_line,
  city,
  state,
  guardian_name,
  guardian_phone,
  school_name,
  board_name,
  stream_name,
  passing_year,
  score_percent,
  exam_roll_no,
  target_course,
  marks_summary,
  bio
)
SELECT
  id,
  '+91 98765 43210',
  '12',
  '2005-06-14',
  'Female',
  'Sreekaryam',
  'Trivandrum',
  'Kerala',
  'R. Reji',
  '+91 98765 40000',
  'Govt Higher Secondary School',
  'State Board',
  'Science',
  2024,
  92.00,
  'KER12-2024-00121',
  'Engineering and computer science programs',
  'Class 12 PCM 92%, KEAM qualified',
  'Interested in computing, student clubs, and campus innovation programs.'
FROM users
WHERE email = 'student@eduvista.com'
ON DUPLICATE KEY UPDATE
  phone = VALUES(phone),
  academic_level = VALUES(academic_level),
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
  marks_summary = VALUES(marks_summary),
  bio = VALUES(bio);

INSERT INTO course_requirements (course_id, document_name, is_required, instructions)
SELECT id, '12th Marksheet', 1, 'Upload a clear PDF or image copy.'
FROM courses
WHERE code = 'CET-CSE-A'
ON DUPLICATE KEY UPDATE instructions = VALUES(instructions);

INSERT INTO course_requirements (course_id, document_name, is_required, instructions)
SELECT id, 'KEAM Score Card', 1, 'Latest score card is mandatory.'
FROM courses
WHERE code = 'CET-CSE-A'
ON DUPLICATE KEY UPDATE instructions = VALUES(instructions);

INSERT INTO course_requirements (course_id, document_name, is_required, instructions)
SELECT id, 'Statement of Purpose', 1, 'Explain why you are a strong fit for this program.'
FROM courses
WHERE code = 'CET-CSE-A'
ON DUPLICATE KEY UPDATE instructions = VALUES(instructions);

INSERT INTO announcements (title, body, target_role, posted_by)
SELECT
  'Registration Open - Spring 2026',
  'General registration is active. Complete course registration before February 20, 2026.',
  'all',
  id
FROM users
WHERE email = 'admin@eduvista.com'
ON DUPLICATE KEY UPDATE
  body = VALUES(body),
  target_role = VALUES(target_role);

INSERT INTO system_settings (setting_key, setting_value)
VALUES
  ('registration_frozen', '0'),
  ('seat_hold_minutes', '5'),
  ('graduation_total_credits', '120'),
  ('graduation_core_credits', '60'),
  ('max_overload_extra_credits', '6'),
  ('payment_provider', 'mock')
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value);

UPDATE users u
LEFT JOIN departments d ON d.id = u.department_id
SET u.department_id = CASE
  WHEN u.department_id IS NOT NULL THEN u.department_id
  WHEN u.role = 'student' OR u.role = 'faculty' OR u.role = 'advisor' OR u.role = 'university' THEN @cse_id
  ELSE u.department_id
END;

UPDATE courses c
LEFT JOIN departments d ON d.id = c.department_id
SET c.department_id = CASE
  WHEN c.department_id IS NOT NULL THEN c.department_id
  WHEN c.department LIKE '%Math%' THEN @math_id
  WHEN c.department LIKE '%Artificial%' THEN @ai_id
  WHEN c.department LIKE '%Human%' THEN @hum_id
  ELSE @cse_id
END;

UPDATE courses
SET semester_id = COALESCE(semester_id, @spring_sem),
    university_id = COALESCE(university_id, @university_id),
    location_state = COALESCE(location_state, 'Kerala'),
    location_city = COALESCE(location_city, 'Trivandrum'),
    duration_label = COALESCE(duration_label, '4 Years'),
    qualification_required = COALESCE(qualification_required, '10+2 PCM 50%'),
    approx_fee_total = COALESCE(approx_fee_total, 'INR 1 Lakh total'),
    registration_starts_at = COALESCE(registration_starts_at, '2025-12-20 09:00:00'),
    registration_ends_at = COALESCE(registration_ends_at, '2026-02-20 23:59:59'),
    add_drop_ends_at = COALESCE(add_drop_ends_at, '2026-02-28 23:59:59');

UPDATE enrollments e
JOIN courses c ON c.id = e.course_id
SET e.semester_id = COALESCE(e.semester_id, c.semester_id),
    e.status = CASE
      WHEN e.status = 'approved' THEN 'registered'
      ELSE e.status
    END;
