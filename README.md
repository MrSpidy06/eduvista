# EDUVISTA - Student Course Registration System (Full Feature Version)

This project now includes a full-stack role-based course registration platform covering Student, Admin, and Faculty/Advisor workflows.

## Implemented Feature Coverage

### 1. Authentication & Role Management
- Student signup
- Login for Student/Admin/Faculty/Advisor
- CAPTCHA-protected login
- JWT + DB-backed session token management
- Role-based API authorization

### 2. Core Course Registration
- Course search and filtering (department, credits, semester)
- Add / Drop courses
- Registration preview summary
- Real-time seat availability
- Temporary seat hold with auto-expiry
- Priority + phase-wise registration windows with countdown
- Prerequisite and eligibility validation
- Credit-limit validation with overload approvals
- Section switching (same course group)
- Add/Drop deadline enforcement
- Registration freeze/unfreeze control
- Registration status tracking (registered, waitlisted, approved, rejected, dropped)
- Enrollment history tracker

### 3. Smart Enrollment & Waitlist
- Waitlist when seats are full
- Waitlist position tracking
- Auto-enrollment from waitlist when seat opens
- Seat/waitlist notifications

### 4. Timetable Management
- Automatic timetable generation
- Conflict detection
- Overlap highlighting
- Alternative section suggestion API + UI action
- Weekly calendar view

### 5. Academic Progress
- Credit completion tracker
- Core vs elective progress
- Graduation eligibility check
- Visual progress cards
- Multi-semester planner

### 6. Approval Workflow
- Credit overload request
- Prerequisite override request
- Advisor-stage decision APIs
- Admin-stage approval/rejection APIs
- Request status tracking

### 7. Notification & Alerts
- Registration/open/deadline/payment/announcement notification categories
- Read/unread tracking
- Mark read / mark all read
- Automated scheduler (hourly alerts + waitlist/hold maintenance)
- Optional SMTP email alerts for registration/deadline/payment events

### 8. Interactive Features
- Course rating and review
- Faculty feedback on student reviews
- Course popularity listing

### 9. Admin Management
- Department management
- Semester management
- Course add/edit/delete
- Seat limit control
- Faculty assignment
- Bulk registration for core subjects
- Freeze/unfreeze registration
- Announcement publishing

### 10. Analytics & Reporting
- Enrollment overview dashboard metrics
- Department-wise report
- Popular courses report
- Registration trend report
- Export reports in Excel-compatible CSV and PDF

### 11. Usability & Security
- Mobile-responsive UI
- Role dashboards for Student/Admin/Faculty
- Bcrypt password hashing
- CAPTCHA login gate
- Session revocation on logout
- Payment gateway integration (mock by default, Stripe-ready)

## Tech Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL

## Project Structure
- `/Users/rijinreji/Downloads/EDUVISTA/frontend` - React app
- `/Users/rijinreji/Downloads/EDUVISTA/backend` - Express API
- `/Users/rijinreji/Downloads/EDUVISTA/database/schema.sql` - Complete DB schema + seed data

## Setup

### 1. Database
Run:

```sql
SOURCE /Users/rijinreji/Downloads/EDUVISTA/database/schema.sql;
```

### 2. Backend

```bash
cd /Users/rijinreji/Downloads/EDUVISTA/backend
cp .env.example .env
npm install
npm run dev
```

Backend: `http://localhost:4000`

Optional integration variables in `/Users/rijinreji/Downloads/EDUVISTA/backend/.env`:
- `ENABLE_SCHEDULER=true`
- `PAYMENT_PROVIDER=mock` (or `stripe`)
- `STRIPE_SECRET_KEY=...` (required when `PAYMENT_PROVIDER=stripe`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

### 3. Frontend

```bash
cd /Users/rijinreji/Downloads/EDUVISTA/frontend
cp .env.example .env
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Demo Accounts
- Student: `student@eduvista.com` / `Student@123`
- Student: `student2@eduvista.com` / `Student@123`
- Admin: `admin@eduvista.com` / `Admin@123`
- Faculty: `faculty@eduvista.com` / `Admin@123`
- Advisor: `advisor@eduvista.com` / `Admin@123`

## Primary API Groups
- `/api/auth/*`
- `/api/courses/*`
- `/api/notifications/*`
- `/api/payments/*`
- `/api/admin/*`
- `/api/faculty/*`
