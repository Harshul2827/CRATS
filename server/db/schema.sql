-- CRATS schema (SQLite). Timestamps are ISO-8601 UTC strings; deadlines are IST calendar dates (YYYY-MM-DD).
-- NULL in eligibility_criteria means "no constraint". Foreign keys are enforced (PRAGMA foreign_keys = ON in client.ts).

CREATE TABLE departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('tpo', 'recruiter', 'student', 'faculty')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL
);

CREATE TABLE students (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id),
  roll_no             TEXT NOT NULL UNIQUE,
  department_id       INTEGER NOT NULL REFERENCES departments(id),
  graduation_year     INTEGER NOT NULL,
  cgpa                REAL NOT NULL CHECK (cgpa BETWEEN 0 AND 10),
  active_backlogs     INTEGER NOT NULL DEFAULT 0 CHECK (active_backlogs >= 0),
  dead_backlogs       INTEGER NOT NULL DEFAULT 0 CHECK (dead_backlogs >= 0),
  tenth_pct           REAL NOT NULL CHECK (tenth_pct BETWEEN 0 AND 100),
  twelfth_pct         REAL NOT NULL CHECK (twelfth_pct BETWEEN 0 AND 100),
  resume_url          TEXT,
  placement_status    TEXT NOT NULL DEFAULT 'UNPLACED' CHECK (placement_status IN ('UNPLACED', 'PLACED')),
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  verified_by         INTEGER REFERENCES users(id),
  verified_at         TEXT
);
CREATE INDEX idx_students_dept_year ON students(department_id, graduation_year);

CREATE TABLE companies (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'BLACKLISTED'))
);

CREATE TABLE recruiters (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id),
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  designation        TEXT NOT NULL DEFAULT 'HR Manager',
  is_primary_contact INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_contact IN (0, 1))
);
CREATE INDEX idx_recruiters_company ON recruiters(company_id);

CREATE TABLE drives (
  id               INTEGER PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id),
  created_by       INTEGER REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  job_type         TEXT NOT NULL CHECK (job_type IN ('FTE', 'INTERNSHIP', 'INTERN_FTE')),
  ctc_text         TEXT NOT NULL,          -- display text, e.g. "Rs 12-14 LPA"
  ctc_value        REAL NOT NULL,          -- LPA, used for sorting and averages
  location         TEXT NOT NULL,
  work_mode        TEXT NOT NULL CHECK (work_mode IN ('Remote', 'Hybrid', 'On-site')),
  openings         INTEGER NOT NULL CHECK (openings > 0),
  deadline         TEXT NOT NULL,          -- YYYY-MM-DD (IST), applications allowed through this date
  status           TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'OPEN', 'CLOSED', 'COMPLETED')),
  rejection_reason TEXT,
  reference_id     TEXT UNIQUE,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  submitted_at     TEXT,
  approved_by      INTEGER REFERENCES users(id),
  approved_at      TEXT
);
CREATE INDEX idx_drives_status ON drives(status);
CREATE INDEX idx_drives_company ON drives(company_id);

CREATE TABLE eligibility_criteria (
  drive_id               INTEGER PRIMARY KEY REFERENCES drives(id) ON DELETE CASCADE,
  min_cgpa               REAL    CHECK (min_cgpa IS NULL OR min_cgpa BETWEEN 0 AND 10),
  max_active_backlogs    INTEGER CHECK (max_active_backlogs IS NULL OR max_active_backlogs >= 0),
  max_dead_backlogs      INTEGER CHECK (max_dead_backlogs IS NULL OR max_dead_backlogs >= 0),
  min_tenth_pct          REAL    CHECK (min_tenth_pct IS NULL OR min_tenth_pct BETWEEN 0 AND 100),
  min_twelfth_pct        REAL    CHECK (min_twelfth_pct IS NULL OR min_twelfth_pct BETWEEN 0 AND 100),
  allowed_graduation_year INTEGER,
  allow_already_placed   INTEGER NOT NULL DEFAULT 0 CHECK (allow_already_placed IN (0, 1))
);

-- No rows for a drive = open to every department.
CREATE TABLE drive_departments (
  drive_id      INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  PRIMARY KEY (drive_id, department_id)
);

CREATE TABLE applications (
  id                  INTEGER PRIMARY KEY,
  drive_id            INTEGER NOT NULL REFERENCES drives(id),
  student_id          INTEGER NOT NULL REFERENCES students(user_id),
  status              TEXT NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED', 'WITHDRAWN')),
  applied_at          TEXT NOT NULL,
  resume_snapshot_url TEXT,
  UNIQUE (drive_id, student_id)
);
CREATE INDEX idx_applications_student ON applications(student_id);

CREATE TABLE offers (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id),
  ctc            REAL NOT NULL CHECK (ctc > 0),
  status         TEXT NOT NULL CHECK (status IN ('ISSUED', 'ACCEPTED', 'DECLINED')),
  issued_at      TEXT NOT NULL,
  responded_at   TEXT
);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  old_value   TEXT,                        -- JSON
  new_value   TEXT,                        -- JSON
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- Append-only: audit rows can never be changed or removed.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
