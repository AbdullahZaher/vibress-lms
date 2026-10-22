# LMS-102 — PostgreSQL schema candidate

**Status: UNDER REVIEW. NOT DEPLOYABLE.** The forward-only SQL candidate is in [migrations/0001_initial.sql](../migrations/0001_initial.sql); the host has not registered, applied or admitted it. This repository remains independent of Vibress core.

## Database and identity invariants

- Core Vibress uses TEXT IDs for publications and Members; course rows reference public.publications(id) with ON DELETE RESTRICT to avoid silently deleting learners' records.
- Every course child is scoped by (publication_id, course_id). Lessons reference matching sections. Both lesson and section translations reference a translation for the same course/locale. Progress references BOTH a same-course enrollment AND a same-course lesson.
- Translated protected content and media references live on lesson_translations only; the canonical lesson ID and enrollment/progress rows do not change when the display locale changes.
- One enrollment per (publication, course, member); one completion per (publication, course, enrollment, lesson). Database uniqueness is necessary for concurrent retries: the pure TypeScript decisions are not sufficient for atomic persistence.
- The core members table does NOT provide UNIQUE(publication_id,id). This migration intentionally has no false composite Member FK. The future host MUST verify the authenticated Member's publication, enforce deletion/reconciliation and prohibit caller-selected identity. This gap is a release blocker, not a claim of enforced membership integrity.
- Restrictive FKs preserve course history on normal deletes. Deferrable section/lesson position uniqueness anticipates transactional reordering; unapproved raw transaction methods are not exposed to plugins.

## Installation and upgrades

The EXT-203 trusted host must implement all of these steps before admitting 0001:

1. Verify trusted external artifact/checksum and migration manifest head; run in a dedicated maintenance/upgrade phase, never a request/activation hook.
2. Verify backup and original core schema, acquire cross-replica migration/admission lock, start a transaction and apply immutable 0001 plus ledger entry atomically.
3. On error, rollback and leave LMS disabled; do not rewrite released migrations, silently replay mismatched SQL or auto-purge learning history.
4. Review SQL/indexes with populated installations, migration restart, lock contention, package version reconciliation, privacy erasure, Member deletion and backup/restore drills. On later changes add 0002 or higher.
5. Host should provide typed publication-scoped repository operations, validated runtime API payloads, secure Member/Staff principals, billing entitlement checks and admin/web view dispatch before an installable LMS is advertised.

## PostgreSQL test (disposable only)

```bash
export LMS_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vibress_lms_test
npm run test:db
```

The script refuses any name except vibress_lms_test; it also refuses a nonempty fixture database with an existing publication table/LMS schema. It creates two publications, executes 0001 transactionally, populates courses/sections/lessons/translations/enrollments/progress, asserts FK and unique-key rejections (including cross-publication AND same-publication cross-course), asserts course records cannot silently vanish with publication deletion and checks a second 0001 fails without removing existing progress.

This verifies a *candidate SQL invariant fixture*, not a real Vibress migration ledger, populated core upgrade, backup/restore, publication auth or plugin runtime behavior. The feature remains **blocked on core EXT-203/204 and minimal EXT-301/302**.
