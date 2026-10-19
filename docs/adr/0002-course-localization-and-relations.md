# ADR-0002 — Stable course identity, localized content and relational integrity

**Status: PROPOSED / required before LMS-102.** Date: 2026-10-19.

## Problem

A lesson can belong to the right publication but the **wrong course**; a progress row can refer to an enrollment in one course and a lesson in another. The public catalog needs translated slugs, but translating a course must not duplicate enrollment or reset progress. Vibress core `members` has `id` as primary key and `publication_id` but no composite UNIQUE(`publication_id`,`id`), so an LMS FK referencing those two columns cannot work without an approved additive core migration.

## Decision A — canonical IDs and locale variants

- `lms_courses` (`publication_id`, `id`) is the stable course record; identity, lifecycle, curriculum revision and access policy are language-independent.
- `lms_course_translations` (`publication_id`, `course_id`, `locale`, `slug`, `title`, `description`, `seo...`): UNIQUE(publication_id,course_id,locale) and UNIQUE(publication_id,locale,slug).
- **Canonical lesson:** `lms_lessons` stores locale-neutral course, section, order, lifecycle, required and revision fields, but **no `content_ref` or `media_ref`**.
- **Locale-specific lesson:** `lms_lesson_translations` stores `(publication_id,course_id,lesson_id,locale,title,body_ref,media_ref,translation_status)` with UNIQUE(pub,course,lesson,locale) and FK(pub,course,lesson) to `lms_lessons`. Section translations also FK(pub,course,section) to `lms_sections`.
- **Shared media:** only through explicit `lms_lesson_shared_assets` that FK to the same publication/course/lesson. Every body/media grant requires current publication-scoped Member/entitlement validation regardless of language.
- **Fallback:** only to an approved **published** target locale translation, respecting current publication locale policy and content visibility; never expose draft translations or private assets via public catalog/SEO/hydration.
- Validate BCP-47 locale and publication-language policy via an approved public host localization service; plugin code must not import private `packages/i18n` internals. Provide canonical/hreflang only for published translations, redirect old slugs safely and avoid route collisions.
- Progress, enrollment, quizzes and media authorization reference stable course/lesson IDs, **not translated slug/locale**. Switching Arabic ↔ English never changes enrolled course or completion history. Curriculum-revision progress reconciliation is separate from translation edits.

## Decision B — constrain same-course references in PostgreSQL

These are conceptual constraint fragments, **not runnable migrations**. Tables must be created with candidate keys and matching types, and migration SQL reviewed before application.

```sql
UNIQUE (publication_id, id)                     -- courses
UNIQUE (publication_id, course_id, id)          -- sections
UNIQUE (publication_id, course_id, id)          -- lessons
UNIQUE (publication_id, course_id, id)          -- enrollments

-- Section / lesson / enrollment each reference same course.
FOREIGN KEY (publication_id, course_id)
  REFERENCES lms_courses (publication_id, id);

-- A lesson's section must be in its own course.
FOREIGN KEY (publication_id, course_id, section_id)
  REFERENCES lms_sections (publication_id, course_id, id);

-- A progress row must reference a lesson and enrollment in ONE course.
FOREIGN KEY (publication_id, course_id, enrollment_id)
  REFERENCES lms_enrollments (publication_id, course_id, id);
FOREIGN KEY (publication_id, course_id, lesson_id)
  REFERENCES lms_lessons (publication_id, course_id, id);
UNIQUE (publication_id, course_id, enrollment_id, lesson_id);

-- Applied to lesson translation/shared asset relation (conceptual):
FOREIGN KEY (publication_id, course_id, lesson_id)
  REFERENCES lms_lessons (publication_id, course_id, id);
UNIQUE (publication_id, course_id, lesson_id, locale); -- lesson translation
```

- `lms_lesson_progress` must store `course_id`, not just enrollment/lesson IDs; both composite FKs above are required. Index FK prefixes. Course archive is non-destructive when learner history exists.
- `lms_enrollments` has UNIQUE(publication_id,course_id,member_id) with one canonical enrollment record; append-only `lms_enrollment_events` records transitions. Progress update validates status and lesson publication/current revision in domain in addition to FK constraints.
- Host resolves authoritative publication and enforces `member.publicationId === publicationId` for Member calls. Existing `members` lacks the composite candidate key; require a host-mediated Member verification + deletion/reconciliation policy, or add the core candidate key through separately reviewed additive migration. A global FK to members.id alone **does not** prove tenant equality.

## Acceptance tests

- Publication A/B and course A/B in the same publication: wrong section/lesson/enrollment/progress links fail at DB and API layers.
- Member of publication B denied by publication A even with a valid Member session; requests cannot supply their own authoritative member/publication.
- Locale switch, slug rename and translation fallback retain course/enrollment/progress identity and never expose draft/private content. Deny public Arabic-to-English fallback that would reveal unpublished English lesson or media.
- Inserted translations/shared assets referencing another course or publication fail their composite FK; reusing an authorized media grant in another locale/course/member fails.
- Fresh install, populated upgrade, partial migration failure/retry, large-table index validation, disable/re-enable and recovery retain learners' records.

**Owner:** Architect, Security, DB/Migration, API, i18n/RTL, QA. This ADR is not an approved implementation contract until signed off.
