# Vibress LMS — test, verification and release strategy

**Status: PROPOSED; no test suite has been executed in this documentation-only repository.** The executable package, migrations and CI are planned in [roadmap](IMPLEMENTATION_ROADMAP.md).

## 1. Testing pyramid

| Layer | Focus |
| --- | --- |
| Domain unit | Course state transitions, enrollment/ownership, prerequisites, progress, grade policy |
| Data/migration | Composite tenant keys, idempotency constraints, forward migration, non-empty backfill, index safety |
| Host contract | Versioned manifest, capability, route, session, publication, settings, disabled-state conformance |
| API integration | Staff, member, public and machine boundaries; schema validation and stable errors |
| Web/admin E2E | Full create→publish→enroll→lesson→complete flow; responsive and RTL |
| Jobs/events | Retry/replay/out-of-order, queue restart, disable/drain, dead-letter and reconciliation |
| Ops/security | Artifact tamper, rebuild image, restore, rollout, dependency audit and private media |

## 2. Minimum test matrix

### Auth / isolation

- Staff owner/editor with and without LMS permission; visitor, Member, disabled Member, invalid member session, machine credentials and forged cookies.
- Publication A vs B with deliberately identical course slug and member-like identifiers; access must be scoped to authoritative context. **A valid Member B session MUST be denied on A's site**, even when no tenant ID is supplied.
- Anonymous cannot read draft course, protected lesson, answer keys, enrollment roster or video secret via direct API, SSR payload, search, theme Liquid or cache.
- Role spoofing by request body/header cannot alter scope; malicious published content cannot XSS admin/student page.
- Disabled plugin cannot receive API request, route render or newly enqueued job. Studio navigation references an admitted staff-only `adminViewId`, never the public `/extensions/vibress-lms/courses` route; spoofed view IDs/unauthorized Staff and URL collisions denied.

### Consistency / failure

- Parallel identical enrollments → one enrollment and append-only status history; parallel completion → one completed state. Enforced database + API rejection of a lesson linked to another course's section, or progress pairing an enrollment/lesson from different courses **within the same publication**.
- Timeout/retry/out-of-order event → no duplicate change or student notification. Distinguish catchable rejected handlers (stable request failure) from in-process fatal failures: **do not assert arbitrary OOM/CPU stall/process exit cannot affect core**. An explicit supervised process/container fault-injection suite is required before claiming hard isolation.
- Course republish and curriculum edits preserve historical progress according to published policy.
- Invalid migration, partial failure, double-run, concurrent activation, older-schema upgrade, restored DB + media.
- Provider unavailable, payment revoked, plan changed, course archived; access policy fail-closed when paid entitlement is uncertain.

### Global UI and SEO

- Arabic RTL, English LTR, mixed English digits and Arabic text; verify language-specific lesson body/media references never leak across public catalog or unauthorized draft fallback; intentionally shared assets require the same publication/course/lesson authorization; one canonical course/lesson ID across locales, student enrollment/progress preserved while switching languages, labels, error messages, long translations and BCP-47 fallback.
- Keyboard-only navigation through lesson list, buttons, dialogs, media player and quizzes; focus preservation and screen-reader output.
- Mobile/narrow view, zoom/reflow, dark/light themes; built-in and external Liquid theme fallback.
- Canonical/hreflang and published-course metadata; protected lessons not indexed, no leaked meta tags.

## 3. CI design (implement when code exists)

1. Format/lint/typecheck + no direct imports from `@vibress/database` or other core internals.
2. Shared runtime schema and unit tests.
3. Host consumer conformance run against minimum and latest supported SDK major/minor. Independent LMS artifact publishes runtime schemas only through public SDK, host validates with `@vibress/api-contracts` adapters, and scoped repositories reject unregistered models, forged tenant filters, raw SQL and invalid transactional writes.
4. Ephemeral Postgres/Redis tests: fresh, legacy fixture upgrade, migration recovery and two-publication isolation.
5. API integration and Playwright web/admin/portal flows, including RTL and accessibility checks.
6. Reproducible operator package build, **SHA-256 of final archive verified against separately trusted release metadata**, pinned Admin/Web assets and audited dependencies.
7. Docker-based install/run/upgrade/disable/restore smoke; release staged only after independent host and LMS CI green.

Never label a check as passed without running it. Include test command, environment, build SHA and failures in release record.

## 4. Versioning and rollout

- Semantic release of LMS package independently from Vibress; do not infer SDK API from package.json versions.
- Maintain a **tested compatibility matrix** for LMS tag × core release × host SDK protocol × migration head.
- Pre-release canary on one publication with preflight, backup and observability; expand after functional, security and latency results are reviewed.
- No automatic downgrade of schema. Restore matched backup or forward-fix when old binaries cannot read new data.
- Keep plugin disabled initially after unknown/mismatched package or incomplete migration; do not silently re-enable.
- Deprecate contracts only after documented compatibility window and consumer tests.

## 5. Release checklist

- [ ] Published host API stable and all required capabilities implemented.
- [ ] Trusted package checksum/signature/allowlist verified in production image.
- [ ] Two-publication cross-read/write tests green, including valid Member B session denied on A.
- [ ] Same-course composite FK rejection, translations/locale switch preserve enrollment/progress; protected body/media belongs to locale translation (or explicit shared asset) and fallback cannot leak draft/private content.
- [ ] Canonical vs alternate SDK adapter policy and real event/deactivate lifecycle tests green.
- [ ] Trusted external archive checksum, registered authenticated Studio `viewId` distinct from public Web routes, content-addressed Admin/Web assets and Worker admission green.
- [ ] Public SDK typed storage/runtime schema conformance validated by host API contracts without plugin private imports.
- [ ] Before Pro release: offline/expiry signed feature claims independently tested from learner billing access.
- [ ] Staff/Member/anonymous distinctions and origin/CSRF enforced.
- [ ] Protected lesson/media/quiz answer privacy suite green.
- [ ] Fresh install, existing data upgrade, backup and restore exercised.
- [ ] Disable/re-enable and background job retry/idempotency exercised.
- [ ] English/Arabic RTL, accessibility and multiple-theme render tested.
- [ ] Public SEO/canonical/hreflang safe and protected pages noindex.
- [ ] Performance budget and operational metrics measured.
- [ ] Core version/SDK/migration support matrix, change log, security disclosure and operator instructions published.
- [ ] Scoped diff and CI reviewed; no debug, secrets, generated artifacts or unrelated changes.
- [ ] Sign-off by Architect, Security, DB, API, Plugin/Theme, i18n/Accessibility and QA.

Release proceeds only when every blocker is resolved; this document is not a test report.
