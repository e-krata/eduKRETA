CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kreta_store (
    id INTEGER PRIMARY KEY,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    student JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT kreta_store_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS class_groups (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grades (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tests (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS omissions (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notices (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS info_board (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dkt_subjects (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS averages (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grades_data
    ON grades USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_homework_data
    ON homework USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_tests_data
    ON tests USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_omissions_data
    ON omissions USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_lessons_data
    ON lessons USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_notices_data
    ON notices USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_info_board_data
    ON info_board USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_averages_data
    ON averages USING GIN (data);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    student_uid TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username
    ON users (username);

CREATE INDEX IF NOT EXISTS idx_users_student_uid
    ON users (student_uid);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Tanulo';

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Több diák (nem csak a singleton kreta_store.student)
CREATE TABLE IF NOT EXISTS students (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    class_group_uid TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_class ON students (class_group_uid);
CREATE INDEX IF NOT EXISTS idx_students_data ON students USING GIN (data);

-- Tanárok
CREATE TABLE IF NOT EXISTS teachers (
    uid TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jegyekhez / mulasztásokhoz diák UID a JSON-ban is (TanuloUid),
-- plusz indexelhető oszlop a szűréshez
ALTER TABLE grades
    ADD COLUMN IF NOT EXISTS student_uid TEXT;

ALTER TABLE omissions
    ADD COLUMN IF NOT EXISTS student_uid TEXT;

ALTER TABLE homework
    ADD COLUMN IF NOT EXISTS class_group_uid TEXT;

ALTER TABLE tests
    ADD COLUMN IF NOT EXISTS class_group_uid TEXT;

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS class_group_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_grades_student ON grades (student_uid);
CREATE INDEX IF NOT EXISTS idx_omissions_student ON omissions (student_uid);
CREATE INDEX IF NOT EXISTS idx_homework_class ON homework (class_group_uid);
CREATE INDEX IF NOT EXISTS idx_tests_class ON tests (class_group_uid);
CREATE INDEX IF NOT EXISTS idx_lessons_class ON lessons (class_group_uid);

-- Tanár profil a store singletonban (opcionális, backward compat)
ALTER TABLE kreta_store
    ADD COLUMN IF NOT EXISTS teacher JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Tanár implementáció – séma bővítések
-- Futtasd a meglévő schema.sql után, vagy illeszd bele.

-- Tanár profil a singleton store-ban
ALTER TABLE kreta_store
    ADD COLUMN IF NOT EXISTS teacher JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Felhasználói szerepkör
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Tanulo';

-- Index role-ra (opcionális)
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Meglévő userek alapértelmezése
UPDATE users SET role = 'Tanulo' WHERE role IS NULL OR role = '';

-- Órarend sablon
CREATE TABLE IF NOT EXISTS timetable_templates (
  uid         TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Intézmények (multi-tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS institutions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institutions_active ON institutions (active);

-- Felhasználóhoz intézmény kötése
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS institute_code TEXT;

CREATE INDEX IF NOT EXISTS idx_users_institute ON users (institute_code);

-- Példa intézmények (törölhetők / cserélhetők)
INSERT INTO institutions (code, name, short_name) VALUES
    ('demo', 'Demó Általános Iskola', 'Demó'),
    ('teszt', 'Teszt Gimnázium', 'Teszt')
ON CONFLICT (code) DO NOTHING;
