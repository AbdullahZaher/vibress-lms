# Product requirements — Vibress LMS

**Status:** PROPOSED / design baseline 2026-10-19.  
**Product:** independent CMS extension; intended deployments include multilingual and Arabic/RTL publications with real paying learners.  
**Success condition:** the same independently built LMS package supports multiple isolated Vibress publications and themes, survives upgrades and protects every learner and course boundary.

## 1. Actors and authority

| Actor | Identity | Capabilities |
| --- | --- | --- |
| Visitor | Anonymous publication request | Discover published free metadata, never private lessons |
| Learner | Vibress Member session | View own enrollments, authorized lessons, own progress and quiz attempts |
| Course editor | Authenticated Staff + explicit LMS permission | Create/edit assigned courses; no access to billing keys or private staff domains |
| Publication LMS manager | Staff + `lms.course.manage` and publication context | Publish courses, manage enrollment and reports in their publication |
| Instructor (future) | Explicit LMS assignment + verified identity and publication | Manage assigned courses/grades only; never grant general Staff privileges implicitly |
| Platform operator | Self-hosted deployment operator | Install trusted artifact, manage package upgrades and backups; not a learner by default |

Course authoring and instructor delegation must not blur Member and Staff identities; decide and document the instructor identity mapping before enabling instructor self-service.

## 2. Scope by release wave

### Spike: proof of external-plugin viability (not public release)

- Operator installs/pins LMS package on a self-hosted instance without adding LMS-specific code to Vibress core.
- Per-publication activation, one staff-admin course editor, one free published course/lesson.
- Authenticated member enrollment and protected lesson page.
- Progress update with ownership + idempotency.
- Arabic/English labels and keyboard-visible navigation.
- Tests for two publications, disable/re-enable, fresh install and upgrade.

### MVP: usable learning experience

| Feature | Acceptance |
| --- | --- |
| Course catalog | Published course list/detail, safe excerpts, slug and SEO; drafts never public |
| Sections + lessons | Ordered hierarchy, draft/published/archived transitions, preview policy |
| Enrollment | Free/self-enroll or staff-invite, unique per (publication, course, member), status history |
| Learning access | Enrollment and current policy checked on every lesson/media access, not just UI |
| Progress | Per-lesson completion and aggregate course progress, atomic and duplicate-safe |
| Admin | Course/lesson management, student counts, basic enrollment/status controls |
| Learner | My courses, lesson navigation, progress/resume, accessible error/empty/loading states |
| Localization | BCP-47 locale resolution and Arabic RTL, mixed-direction content, translated labels |
| Observability | Audited admin mutations, request IDs, basic completion/error metrics |
| Operations | Safe migrations, retain data on disable, encrypted configuration, tested backup/restore |

### Pro, after MVP gates

- Question banks and quizzes, retries/time limits, grading, randomized question policy, secure assessment attempts.
- Assignments/manual grading, instructor delegation and moderation audit.
- Signed/verifiable certificates, revocation, verification URL, downloadable formats.
- Drip scheduling/prerequisites, cohorts, learning paths, detailed reporting.
- Billing/commerce access: **recurring** entitlements via existing subscription reader when contract exists; **one-time** purchase/checkout only after a reviewed commerce capability is built. Refund/cancellation semantics must revoke future access without destroying history.
- Notifications, email, webhooks, calendar/live-session integrations, SCORM/xAPI only if justified by separate RFCs.

### Explicitly out of scope until reviewed

- Public untrusted plugin ZIP/npm uploads; reliance on a managed proprietary LMS cloud.
- Hosting/streaming protected video by exposing public bucket object URLs.
- Unreviewed marketplace licensing or DRM promises.
- Arbitrary course-specific dynamic Next.js source edits, direct core Drizzle imports.
- Third-party proctoring/surveillance as an unexamined default.
- Payment processors or taxes implemented ad hoc inside LMS core.

## 3. Key user journeys

1. **Create course:** manager with publication permission creates draft → adds sections/lessons and locales → preview → publishes → catalog accessible with SEO.
2. **Enroll:** member signs in through existing Member auth → requests enrollment → LMS verifies publication, course availability and access policy → records unique active enrollment → returns no other learner data.
3. **Study:** learner navigates owned enrollment → host/API checks member, publication, publication visibility and lesson access → renders page → media access uses short-lived server-authorized token.
4. **Complete:** learner marks lesson complete → server checks ownership and prerequisite policy → idempotent transaction writes progress → aggregate progress recomputed consistently.
5. **Disabled plugin:** no new LMS API/pages/tasks admitted; data remains intact, core Vibress content/membership works.
6. **Upgrade:** operator pins compatible release, migrates forward, checks canary, enables publication by publication; failure records safe recoverable state.

## 4. Global quality and non-functional requirements

- **Security:** fail-closed 401/403/404; never leak quizzes, protected lesson content, private media, learner PII or publication data through public listing, SSR, cache, search or webhooks.
- **Performance:** set and measure budgets in the first spike (catalog p95, lesson p95, DB queries/page, queue lag, media-token request overhead). No unmeasured numeric SLO claims.
- **Availability:** LMS failure must not take down core CMS; use health-gated activation and isolated async processing.
- **Data:** publication ownership constraints, transactionally consistent enroll/progress, repairable index, export/delete under operator privacy policy.
- **Accessibility:** WCAG-oriented semantic navigation, focus order, captions/transcripts, keyboard-only player/quiz controls, high contrast, accessible validation/error descriptions.
- **Localization:** use platform locale policy/translation APIs, not hardcoded LTR/English. RTL layouts and mixed numbers/Latin fragments tested.
- **SEO:** list/detail pages safe metadata, canonical/hreflang, noindex restricted lessons, consistent slugs under locale prefix, no duplication with Content Modeler.
- **Self-hosting:** Postgres/Redis/reverse proxies/Docker, no hidden remote installer; backup/restore includes LMS schema, secrets and private files.
- **Compatibility:** host SDK major matrix, data migration head, theme fallback and old persisted course schema support documented.

## 5. Product measures (record baseline; do not invent targets)

Activation success, first-course publish completion, first-enrollment success, lesson completion correctness, enrollment access-denial rate, course progress reconciliation rate, learner task success under Arabic/RTL, migration failure/recovery rate and upgrade compatibility across supported versions.

## 6. MVP release blockers

No independently installed working host package; inability to ensure multi-publication isolation; public access to protected lesson or answer keys; paid entitlement assumed without a compatible contract; untested backfill/upgrade/restore; inaccessible RTL player/learner flow; plugin disabled but endpoints still active.

See [roadmap](IMPLEMENTATION_ROADMAP.md), [security](SECURITY_OPERATIONS.md), [test plan](TEST_RELEASE.md).
