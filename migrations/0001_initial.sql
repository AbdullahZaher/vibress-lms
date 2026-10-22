-- CANDIDATE ONLY: not admitted, registered or applied by Vibress EXT-203.
-- Core publication IDs are text; members lacks UNIQUE(publication_id,id).
-- A trusted host migration runner must verify artifact/checksum, lock and
-- apply once transactionally. NEVER execute inside plugin activation.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA vibress_lms;

CREATE TABLE vibress_lms.courses (
  publication_id text NOT NULL REFERENCES public.publications(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  access text NOT NULL DEFAULT 'free' CHECK (access IN ('free','paid')),
  default_locale text NOT NULL CHECK (length(default_locale) BETWEEN 2 AND 35),
  curriculum_revision integer NOT NULL DEFAULT 1 CHECK (curriculum_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_courses_pk PRIMARY KEY (publication_id, id)
);
CREATE INDEX lms_courses_pub_status_idx ON vibress_lms.courses
  (publication_id, status, created_at DESC);

CREATE TABLE vibress_lms.course_translations (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  locale text NOT NULL CHECK (length(locale) BETWEEN 2 AND 35),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  slug text NOT NULL CHECK (length(slug) BETWEEN 1 AND 240),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_course_translations_pk PRIMARY KEY (publication_id, course_id, locale),
  CONSTRAINT lms_course_translations_slug_unique UNIQUE (publication_id, locale, slug),
  CONSTRAINT lms_course_translations_course_fk
    FOREIGN KEY (publication_id, course_id)
    REFERENCES vibress_lms.courses (publication_id, id) ON DELETE RESTRICT
);

CREATE TABLE vibress_lms.sections (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_sections_pk PRIMARY KEY (publication_id, course_id, id),
  CONSTRAINT lms_sections_position_unique
    UNIQUE (publication_id, course_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT lms_sections_course_fk
    FOREIGN KEY (publication_id, course_id)
    REFERENCES vibress_lms.courses (publication_id, id) ON DELETE RESTRICT
);

CREATE TABLE vibress_lms.section_translations (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  section_id text NOT NULL,
  locale text NOT NULL CHECK (length(locale) BETWEEN 2 AND 35),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  CONSTRAINT lms_section_translations_pk
    PRIMARY KEY (publication_id, course_id, section_id, locale),
  CONSTRAINT lms_section_translations_section_fk
    FOREIGN KEY (publication_id, course_id, section_id)
    REFERENCES vibress_lms.sections (publication_id, course_id, id) ON DELETE RESTRICT,
  CONSTRAINT lms_section_translations_course_locale_fk
    FOREIGN KEY (publication_id, course_id, locale)
    REFERENCES vibress_lms.course_translations (publication_id, course_id, locale) ON DELETE RESTRICT
);

CREATE TABLE vibress_lms.lessons (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  section_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  required boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_lessons_pk PRIMARY KEY (publication_id, course_id, id),
  CONSTRAINT lms_lessons_position_unique
    UNIQUE (publication_id, course_id, section_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT lms_lessons_section_fk
    FOREIGN KEY (publication_id, course_id, section_id)
    REFERENCES vibress_lms.sections (publication_id, course_id, id) ON DELETE RESTRICT
);
CREATE INDEX lms_lessons_curriculum_idx ON vibress_lms.lessons
  (publication_id, course_id, section_id, position);

CREATE TABLE vibress_lms.lesson_translations (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  locale text NOT NULL CHECK (length(locale) BETWEEN 2 AND 35),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  body_ref text,
  media_ref text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_lesson_translations_pk
    PRIMARY KEY (publication_id, course_id, lesson_id, locale),
  CONSTRAINT lms_lesson_translations_lesson_fk
    FOREIGN KEY (publication_id, course_id, lesson_id)
    REFERENCES vibress_lms.lessons (publication_id, course_id, id) ON DELETE RESTRICT,
  CONSTRAINT lms_lesson_translations_course_locale_fk
    FOREIGN KEY (publication_id, course_id, locale)
    REFERENCES vibress_lms.course_translations (publication_id, course_id, locale) ON DELETE RESTRICT
);

CREATE TABLE vibress_lms.enrollments (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  member_id text NOT NULL CHECK (length(member_id) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  source text NOT NULL DEFAULT 'self' CHECK (source IN ('self','staff','import')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT lms_enrollments_pk PRIMARY KEY (publication_id, course_id, id),
  CONSTRAINT lms_enrollments_one_per_member UNIQUE (publication_id, course_id, member_id),
  CONSTRAINT lms_enrollments_course_fk
    FOREIGN KEY (publication_id, course_id)
    REFERENCES vibress_lms.courses (publication_id, id) ON DELETE RESTRICT,
  CONSTRAINT lms_enrollments_revocation_check
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);
CREATE INDEX lms_enrollments_member_idx ON vibress_lms.enrollments
  (publication_id, member_id, status);

CREATE TABLE vibress_lms.lesson_progress (
  publication_id text NOT NULL,
  course_id text NOT NULL,
  enrollment_id text NOT NULL,
  lesson_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_lesson_progress_pk
    PRIMARY KEY (publication_id, course_id, enrollment_id, lesson_id),
  CONSTRAINT lms_lesson_progress_enrollment_fk
    FOREIGN KEY (publication_id, course_id, enrollment_id)
    REFERENCES vibress_lms.enrollments (publication_id, course_id, id) ON DELETE RESTRICT,
  CONSTRAINT lms_lesson_progress_lesson_fk
    FOREIGN KEY (publication_id, course_id, lesson_id)
    REFERENCES vibress_lms.lessons (publication_id, course_id, id) ON DELETE RESTRICT
);
CREATE INDEX lms_lesson_progress_enrollment_idx ON vibress_lms.lesson_progress
  (publication_id, course_id, enrollment_id);
