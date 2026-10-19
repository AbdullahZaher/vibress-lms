# Vibress LMS — logical data model and migration policy

**Status: ACCEPTED DATA MODEL INVARIANTS; concrete Drizzle tables/SQL and migration remain unapproved and unimplemented.** [ADR-0002](adr/0002-course-localization-and-relations.md). SQL below illustrates invariants, not an applied Drizzle schema/migration. Host-owned migration/data service must be implemented and approved first.

## 1. Storage ownership decision

Use plugin-owned tables/schema (e.g. `vibress_lms`) in the same PostgreSQL instance initially, provisioned through a secure host-managed migration lifecycle. No direct imports of Vibress core Drizzle types or cross-domain internal queries. The LMS application accesses data through its own typed adapters with **publication-bound scope supplied by the host**.

Content Modeler is appropriate for selected public editorial catalog fields only, via supported public APIs; it must not store or expose learner records, quiz answers, protected content or gradebook in public Collections.

## 2. Tables (minimum design)

| Table | Key and essential columns | Constraints and purpose |
| --- | --- | --- |
| `lms_courses` | `id, publication_id, status, curriculum_revision, default_locale, created_at, updated_at` | UNIQUE(publication_id,id); **stable** course ID regardless of translation |
| `lms_course_translations` | `publication_id, course_id, locale, slug, title, description, seo_*` | UNIQUE(publication_id,course_id,locale); UNIQUE(publication_id,locale,slug); FK to canonical course |
| `lms_section_translations` | `publication_id, course_id, section_id, locale, title` | FK(pub,course,section) and UNIQUE(pub,course,section,locale) |
| `lms_lesson_translations` | `publication_id, course_id, lesson_id, locale, title, body_ref, media_ref, translation_status` | FK(pub,course,lesson) and UNIQUE(pub,course,lesson,locale); **locale-specific protected body/media** |
| `lms_lesson_shared_assets` (only when needed) | `publication_id, course_id, lesson_id, asset_ref, purpose` | Explicit publication/course/lesson-owned shared media; access still private |
| `lms_sections` | `id, publication_id, course_id, position` | UNIQUE(publication_id,course_id,id); FK(pub,course) to course, locale-neutral order |
| `lms_lessons` | `id, publication_id, course_id, section_id, position, status, required, revision` | UNIQUE(pub,course,id), FK(pub,course,section_id); **locale-neutral structure only** |
| `lms_enrollments` | `id, publication_id, course_id, member_id, status, source, enrolled_at, revoked_at` | UNIQUE(pub,course,id) + UNIQUE(pub,course,member_id); Member publication checked by host |
| `lms_lesson_progress` | `id, publication_id, course_id, enrollment_id, lesson_id, completed_at, updated_at` | FK(pub,course,enrollment) and FK(pub,course,lesson); UNIQUE(pub,course,enrollment,lesson) |
| `lms_enrollment_events` | `id, publication_id, course_id, enrollment_id, from_status, to_status, occurred_at` | Append-only enrollment status history |
| `lms_idempotency_keys` | `publication_id, scope, actor_id, operation, key, response_hash, expires_at` | Dedup enroll/complete/quiz events; no raw bearer tokens |
| `lms_audit_events` | `id, publication_id, actor_kind, actor_id, action, target_id, occurred_at, request_id` | Redacted immutable history, retention schedule |
| `lms_outbox_events` | `id, publication_id, event_type, payload, published_at` | Durable event delivery; retries and dedup |

Pro additions: `lms_quizzes`, `lms_questions`, `lms_quiz_attempts`, `lms_attempt_answers`, `lms_certificates`, `lms_course_entitlements`, `lms_instructor_assignments`. These are **not** part of spike/migration 0001 unless a concrete accepted use case requires them.

### Required invariants

All course references share **publication and course ID**. `lms_lesson_progress` stores `course_id` to allow separate composite FKs to lesson and enrollment of that course. `lms_lessons` uses FK(publication_id,course_id,section_id). Locale translations share stable canonical IDs; enrollment/progress is never bound to a localized slug. Localized lesson bodies and media belong **only to published, authorized `lms_lesson_translations`**, not canonical `lms_lessons`. Shared assets use an explicit composite FK link. Any fallback between languages requires host locale-policy approval, *published translation state* and fresh learner entitlement; never reveal private media in catalog, SSR metadata or public caches. Core Members currently lacks UNIQUE(publication_id,id), so its composite FK is **not** available without a separately approved additive core migration: require host-verified Member ownership and deletion/reconciliation, not a speculative FK. Full decision: [ADR-0002](adr/0002-course-localization-and-relations.md).

### Example composite isolation invariant

```sql
-- Conceptual only: SQL must be generated from approved schema and reviewed.
UNIQUE (publication_id, id) -- parent course
UNIQUE (publication_id, course_id, id) -- sections, lessons, enrollments
FOREIGN KEY (publication_id, course_id)
  REFERENCES vibress_lms.lms_courses (publication_id, id);
FOREIGN KEY (publication_id, course_id, section_id)
  REFERENCES vibress_lms.lms_sections (publication_id, course_id, id);
FOREIGN KEY (publication_id, course_id, enrollment_id)
  REFERENCES vibress_lms.lms_enrollments (publication_id, course_id, id);
FOREIGN KEY (publication_id, course_id, lesson_id)
  REFERENCES vibress_lms.lms_lessons (publication_id, course_id, id);
FOREIGN KEY (publication_id, course_id, lesson_id)
  REFERENCES vibress_lms.lms_lessons (publication_id, course_id, id); -- translated lesson/shared asset
UNIQUE (publication_id, course_id, lesson_id, locale) -- translated lesson
UNIQUE (publication_id, course_id, section_id, locale) -- translated section
UNIQUE (publication_id, course_id, member_id) -- enrollment
UNIQUE (publication_id, course_id, enrollment_id, lesson_id) -- progress
```

If core Members permits a composite FK keyed by (publication_id,id), use it to guarantee same-publication membership; otherwise validate authoritatively via host Members service and enforce through transaction/constraint design. Do not assume core Member schema has an index not explicitly verified.

## 3. Transactional rules

- Course publish only when required published sections/lessons pass validation; publish metadata must not expose protected lesson body.
- Enrollment is insert-or-existing with idempotency key and database uniqueness; all requests recheck publication/course/member status.
- Progress completion checks active owned enrollment and valid lesson in same course; safe to retry. Never accept caller `memberId` as ownership proof.
- Updating course curriculum must define progress counting against curriculum revision; avoid silently lowering/staging completed counts for learners.
- Quizzes later: immutable submitted attempt snapshots (question version, correct answer policy, grade version), server timestamps, safe regrade/audit.
- Events/jobs emitted from durable outbox **after** transaction commit; no double enrollment on webhook duplication.

## 4. Migrations and release compatibility

1. Plugin release includes immutable namespaced migrations, manifest migration head and checksums.
2. Install preflight validates host SDK, DB minimum version, permissions, backup and expected migration ledger.
3. Add new nullable fields/indexes first; backfill in restart-safe batches; constrain only after verification. Bound table locks and large-table index creation.
4. Migration runner records applied versions per plugin and installation; concurrent worker protection with advisory lock or approved equivalent.
5. Upgrade code only once data is compatible; no destructive down migration automatically. Preserve snapshots and forward recovery plan.
6. Disable/uninstall keep data/settings, enrollment and certificate history intact. Purge is separate authenticated audited action with export.
7. Test a fresh database, a non-empty older dataset, partial failure/retry, duplicate migration, and restore with matching pinned package.

## 5. Privacy, retention, exports and indexing

- Treat Member IDs, enrollment/progress, quiz responses and certificate records as personal data; minimize and scope internal logs, analytics and events.
- Public course indexes include only publication-approved metadata. Never index or expose protected translated lesson bodies, private media references, draft fallback, quiz answers or learner records. All media references resolve through same-publication scoped storage and lesson access checks.
- Private lesson media refer to protected object IDs; storage signed URLs must expire and be bound to verified authorization. Cache `private/no-store` where appropriate.
- Create retention/export/delete jobs that respect legal obligations, education records and audit requirements; coordinate Member deletion with LMS records and referential integrity.
- Backups include plugin schema, job/outbox ledgers, media and encryption keys. Restore must reconcile pending jobs to avoid duplicate side effects.
- Index all publication-scoped queries appropriately: e.g. (publication_id, course_id), (publication_id, member_id, status), (publication_id, enrollment_id, lesson_id); performance verify before final migration.

Related [architecture](ARCHITECTURE.md), [security](SECURITY_OPERATIONS.md), [test strategy](TEST_RELEASE.md).
