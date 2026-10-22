# Vibress LMS — executable domain foundation (2026-10-20)

**Status: DEVELOPMENT ONLY. NOT A HOST-INSTALLED PLUGIN.** This repository contains a genuine, tested pure LMS domain foundation. No persistent data is written.

## Host review snapshot (verified 2026-10-20)

- Vibress core `main` currently exposes `@vibress/plugin-sdk` protocol `1.0.0`, lifecycle hooks, and operator-trusted plugin activation. The SDK protocol version is not the same as its npm package version.
- [Core PR #62](https://github.com/AbdullahZaher/vibress/pull/62) is open and not merged at inspection time. It adds optional host-mediated Admin/Member/Public API route descriptors and host-resolved principal/publication, but does **not** implement EXT-203 plugin-owned scoped repositories or migrations.
- Current EXT-201 route responses are scalar-shape descriptors; a real paginated course catalog or nested curriculum needs a reviewed versioned data envelope or an explicitly supported, bounded representation. Do not stringify arbitrary JSON into scalar fields to evade runtime validation.
- EXT-203/204 scoped persistence and Member/entitlement bridges, EXT-301/302 Admin/Web view registration, and worker/artifact contracts remain blockers to a shippable LMS.

## Scope implemented here

- Canonical, locale-neutral course/lesson/enrollment/completion TypeScript domain types.
- Publication readiness decision for course sections, lesson ownership, unique structural IDs/positions, canonical BCP-47 locales and fully published lesson translations for every advertised locale.
- Free-course enrollment admission decision with duplicate detection, suspension/revocation review, strict same-publication/member/course binding and paid-access fail-closed behavior.
- Published-locale-only public metadata projection, with no private lesson refs exposed.
- Free-course protected lesson access decision requiring matching publication, course, active enrollment, Member ID, and published course/lesson locale; paid access fails closed.
- Deterministic required-lesson progress and duplicate-completion admission logic, including cross-course integrity failures and no automatic completion of empty curricula.
- Node built-in unit tests covering successful and denied scenarios for Arabic/English content.

## Guardrails / explicit non-features

These functions **do not authenticate callers**; `VerifiedMemberScope` is only a type indicating expected **host-verified input**. An API handler must obtain Member and publication from independent authoritative host resolvers, check equality, validate external input at runtime, and enforce origin/CSRF policy. Never trust client-provided IDs, `isPaid`, or self-asserted roles. Raw private media references returned to authorized server logic are **not download grants**.

`decideCoursePublication` does not publish content, and `decideFreeEnrollment` does not persist enrollments. Both require host-validated payloads, independently verified authority-bound publication/session identity, scoped transactions and durable unique constraints. A repeated eligible decision is not database-level idempotency. `decideLessonCompletion` does not write progress. A future host-mediated transaction and UNIQUE(publication_id,course_id,enrollment_id,lesson_id) constraint must enforce concurrency safety and idempotency. `calculateCourseProgress` describes the current published required curriculum revision, not a durable completion certificate. A standalone, unregistered candidate migration is now present for review; it is NOT applied by the host. No direct core DB access, plugin manifest, routes, feature claims, or fake worker was added.

## Local verification

```bash
npm install
npm run typecheck
npm test
```

The development snapshot was tested locally with global TypeScript 5.8.3 and Node 22.16.0: strict typecheck succeeded and **26 Node tests passed**. This is not proof of CI, host integration, published SDK compatibility, API authorization, PostgreSQL upgrades, Docker, or browser/RTL E2E verification.

## Engineering increment: publication and enrollment decisions

Source: `src/domain/course-publication.ts` and `src/domain/enrollment.ts`. Tests: `test/lifecycle.test.mjs`.

- Accept only canonical locale strings for published translations. A public course locale is not advertised as ready unless all its published lessons have a published translation in that locale; draft lessons may remain incomplete.
- Require at least one published required lesson and structurally valid same-course sections before a draft may be published.
- A Member may request free-course enrollment only for the host-resolved publication, published course and exact published locale. Existing active enrollment returns `already-enrolled`; suspended/revoked returns `reactivation-required`. Paid courses always return `entitlement-required`.
- These are in-memory **decisions**, not an API, migration, durable write, claim of actual membership authentication, or host-side permission guard. The existing 11 tests remain green; this increment adds 15 tests (26 total).

**Local validation:** Node 22.16.0, global TypeScript 5.8.3, `npm run typecheck` passed; `npm test` passed 26/26. Full PostgreSQL/CI/host conformance remain unrun, and `npm install` could not be exercised in the offline execution environment.

## LMS-102: candidate schema and PostgreSQL checks (2026-10-20)

- Added [SQL proposal](../migrations/0001_initial.sql) and [migration/upgrade review](MIGRATION_0001.md): course, course/section/lesson translations, sections, lessons, enrollments and lesson progress.
- Compound foreign keys enforce publication and course equality; course/student-enrollment and progress duplicates are guarded by PostgreSQL UNIQUE constraints. Existing Member ownership is still a host responsibility.
- Added a guarded [disposable PostgreSQL test script](../scripts/test-postgres.sh), fixture and adversarial SQL assertions and a GitHub Actions PostgreSQL 16 test job.
- **Not yet production accepted:** the SQL has no EXT-203 migration ledger, data API or host registration. No integration with the real Vibress members API, operator deployment or restore run was claimed. CI outcomes must be reviewed separately.

## CI investigation (2026-10-20)

The newly created GitHub Actions workflow currently reports FAILURE before assignment to a runner: the run's job has zero steps, no runner ID and no usable job logs. This is **CI infrastructure/configuration blocking execution**, not evidence that the SQL passed or failed. No live PostgreSQL integrity run is claimed. [Example failed workflow](https://github.com/AbdullahZaher/vibress-lms/actions/runs/39382195660). After runner availability is restored, re-run and diagnose actual tests before approval.

## Offline validation alternative (2026-10-20)

The repository now provides `npm run lint` (strict compiler-based checks, **not ESLint**) and `npm run verify:local` (lint, typecheck, build and unit tests). The complete command was executed locally and **passed 26/26 Node tests** on Node 22.16.0 / TypeScript 5.8.3. Source/test Git blob hashes matched the GitHub branch at verification.

See [local verification record](LOCAL_VERIFICATION.md). GitHub Actions is not currently usable; failed runs allocate no runner and contain no executed steps. The PostgreSQL integrity/upgrade suite was not executed in this environment and remains a release blocker. **Passing local tests must not be treated as migration acceptance.**

## Next gated steps

1. Have core complete/review host typed scoped storage, authoritative Member and entitlement facades, migration ledger, and stable route response validation.
2. Build public-SDK-only install fixture/manifest and exercise actual host admission, activation, per-publication disablement and schema negotiation.
3. Have the candidate 0001 migration reviewed against a running PostgreSQL instance and the actual EXT-203 host runner; complete populated-upgrade, replay/recovery, concurrent-instance and restore tests.
4. Implement staff course publishing, member enrollment and secured locale-aware lesson routes, plus Studio/Web UI with RTL, accessibility, SEO and theme fallback.
5. Run full negative-case host integration, race/idempotency, Docker, backward-compatibility, and CI matrix before declaring MVP or Pro readiness.

This branch intentionally avoids changes to Vibress core and does not overlap the ongoing core extension host agent.


## LMS host application increment — 2026-10-22

This branch now includes `src/application/host-operations.ts`, a typed
`LmsHostApplication` boundary, and adversarial Node tests. Its public course
projection is locale-specific and excludes lesson/media/private/member data.
Enrollment requires an authoritative current-Member resolver for the
Host-selected publication and an atomic host-backed
`insertFreeEnrollmentIfAbsent` repository operation that rechecks
published/free course status inside the transaction and uses a unique
(publication, course, Member) key. Duplicate races return
`already-enrolled`; revoked/suspended enrollments never reactivate
automatically. Protected lesson access requires active same-publication
enrollment; paid access fails closed.

**EXT-205 merged:** the Vibress Member extension Host now exposes optional
Host-authorized, Member-owned transactional record storage. The generic
Staff storage API remains separate. The independent ESM pilot above exercises
this record API against a fake Host but full installed-Host validation
is still outstanding. The
existing generic plugin storage API is deliberately Staff-only. A direct
Drizzle/database import in `vibress-lms` would violate the security
boundary. The pure application boundary therefore has no production
repository adapter or installed route registration yet. It is genuine
reusable LMS business logic, **not** completion of EXT-501/503/504.

Test with `npm run verify:local`. PostgreSQL disposable migration tests,
cross-repo installed E2E, signed release acceptance and real restore
are separate gates, and their success must not be inferred from the
in-memory-port tests.

## Publication-scoped public course catalog

The application port now includes a bounded, cursor-paginated
`listPublicCourses` read operation. The repository must list **only the Host's
resolved publication** and cannot use client-supplied tenant selectors. The
application then applies `projectPublicCourse` to each row, omitting drafts,
other publications and unpublished locale variants; it never serializes lesson
body, media or Member fields. Invalid limits/cursors and overfull repository
pages fail closed. The optional port keeps earlier domain adapters compatible.

This is application code plus tests, not a deployed Web SSR/Host catalog
integration. Operator-approved storage, Member atomic enrollment and an
independent signed installable artifact are still release blockers.

## Member progress/completion application contract (additional pilot)

The Host-scoped application service also projects course progress and admits
lesson completion only for a verified Member session, an active enrollment
and a published/free course and lesson in the requested published locale.
It accepts **no caller-selected Member or publication identifier**.
Progress validates every lesson/completion row against the parent course
and enrollment, caps read-model size, and keeps paid-course progress blocked
until an independent paid-entitlement authorization bridge exists.

Completion is *idempotent at the application contract level*: the verified
Host repository must recheck Member enrollment and course/lesson visibility
under the same transaction as a unique composite insert. Duplicate concurrent
requests return `already-completed`, revoked enrollments never reactivate,
and mismatched repository results fail closed.

These are typed application contracts with adversarial tests, not a live
Host-Member persistence adapter. Candidate LMS SQL is still not an approved
migration, and the platform does not yet expose the required public
Member-owned transaction service.

## EXT-501: independent signed-artifact pilot (2026-10-22)

Vibress [core PR #80](https://github.com/AbdullahZaher/vibress/pull/80)
merged EXT-205 Host Member storage. This branch now adds a provisional,
operator-reviewed single-file ESM LMS pilot. It implements one fixed bilingual
free course, Member-only free enrollment, protected plain-text lessons, and
idempotent progress writes through `scope.memberStorage`. The artifact is
source-independent and hash-pinned by the generated **unsigned** review
lockfile. See [pilot operator runbook](PILOT_EXT205.md).

Verified locally for this increment: strict TypeScript 5.8.3 compilation and
7 focused Node tests. This is NOT an installed two-publication Vibress Host
E2E, a signed/reproducible release approval, an independent production SDK
compatibility certification, a tested existing-tenant migration or a real
paid-course authorization. It does not replace the standalone relational LMS
product-schema candidate, and does not yet ship course authoring.
