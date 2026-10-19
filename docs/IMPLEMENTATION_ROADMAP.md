# Vibress LMS — professional implementation roadmap

**Status:** PROPOSED, not started.  
**Critical dependency:** Vibress external plugin platform EXT tickets in [core roadmap](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-roadmap.md).  
**Delivery model:** additive, independent versioned releases; no core-specific LMS patches, no unverified runtime interfaces. Milestones are dependency gates, not date promises.

## Workstream ownership and prerequisites

| Role | Decision |
| --- | --- |
| Architect | Package boundary; public SDK only; route/data contract compatibility |
| Security Reviewer | Staff vs Member auth, authoritative publication, media/assessment protection, supply chain |
| DB/Migration Engineer | Namespaced schema, composite isolation, upgrade/backfill, backup and restore |
| API Designer | Versioned admin/member/public schemas and errors; entitlement reader contract |
| Plugin/Theme Reviewer | No private imports; fallback view models, locale-aware routes, external theme slots |
| i18n/RTL + Accessibility | Arabic/English, bidi, semantic lessons, keyboard focus, media captions |
| QA/Operations | Automated matrix, hosted release, failure injection and recovery |

## Wave 0 — Confirm foundations (before LMS implementation)

| Ticket | Deliverable | Definition of done |
| --- | --- | --- |
| LMS-001 | Approve product scope and actor/identity model | Member/Staff/instructor boundaries documented |
| LMS-002 | Review host SDK/EXT dependency and plugin support matrix | Host APIs accepted and published; feature flags/blocked items explicit |
| LMS-003 | ADR on course content source and plugin data ownership | Private lessons isolated; no public Content Modeler leakage |
| LMS-004 | Threat model for paid content, assessments, staff access and media | Review sign-off; denial matrix agreed |

**Gate:** EXT-101..104, EXT-201..204 plus minimal EXT-301/302 interfaces usable; otherwise work remains design/prototype, not production plugin.

## Wave 1 — End-to-end thin vertical slice (integration pilot)

| Ticket | Deliverable | Acceptance |
| --- | --- | --- |
| LMS-101 | Independent package skeleton, pinned host SDK, manifest and operator install docs | Build/test against published host fixture; no private imports |
| LMS-102 | Plugin-owned migration `0001`: course, section, lesson, enrollment, progress, idempotency | Empty + non-empty upgrade/restore tests, multi-publication constraints |
| LMS-103 | Minimal admin course draft/publish API and UI | Authorized Staff only; input/runtime schemas; origin/role tests |
| LMS-104 | Published public course/detail + protected lesson default page | Draft invisible, safe metadata, locale/SEO, accessible fallback |
| LMS-105 | Member free enrollment and lesson access/complete | Ownership, idempotency, wrong publication, disabled plugin tests |
| LMS-106 | Dual-publication integration and Docker deploy rehearsal | One enabled/one disabled; upgrade/re-enable preserves learner data |

**Gate (pilot acceptance):** No LMS-specific core patch, two themes, English+Arabic RTL, public/private separation, real host conformance tests pass.

## Wave 2 — MVP course and learner experience

| Ticket | Deliverable | Acceptance |
| --- | --- | --- |
| LMS-201 | Course curriculum builder, section ordering, draft/published transitions | Transactional saves, revision policy, invalid state rejection |
| LMS-202 | Learner course dashboard, lesson resume, course progress | Correct counts on duplicates/curriculum edits, accessible states |
| LMS-203 | Admin enroll/unenroll controls, staff permissions and learner list pagination | Audited, publication-scoped, least-privilege exports |
| LMS-204 | Content localization, media permissions, safe course SEO | RTL keyboard/mobile, restricted noindex, private asset checks |
| LMS-205 | Events/jobs, audit, dedup and queues for LMS domain | Worker retry/crash/replay tests; no lost updates |
| LMS-206 | Docs, ops and staging recovery drill | Reproducible Docker, backup/restore, downtime guidance |

**Gate:** release candidate v1 MVP: production-like dataset, upgrade, security suite, performance baselines and all supported theme/i18n tests green.

## Wave 3 — Assessments & instructor capability (Pro)

| Ticket | Deliverable | Acceptance |
| --- | --- | --- |
| LMS-301 | Question banks, quiz/attempt schemas and answer-key isolation | No answer leakage, immutable snapshot, attempt race tests |
| LMS-302 | Quiz engine, timers/retries and scoring | Server-authoritative grades; replay/regrade audit |
| LMS-303 | Assignments/manual review and bounded instructor delegation | Only assigned scope, member/staff mapping reviewed |
| LMS-304 | Certificates with signed IDs, revocation and verification | Forgery, duplicate generation, revocation and privacy tests |
| LMS-305 | Reporting and cohort completion views | Aggregate safe outputs, pagination/large-data performance |

**Gate:** Pro features optional/incremental, no breaking schema or required theme changes for existing MVP installs.

## Wave 4 — Commerce, ecosystem and scale (conditional)

| Ticket | Deliverable | Acceptance |
| --- | --- | --- |
| LMS-401 | Core subscription-backed recurring course entitlements | Cancellation, grace, replay and cross-member tests |
| LMS-402 | One-time course purchase **only after supported Vibress commerce capability** | Verified payment truth, refund/reversal policies |
| LMS-403 | Drip/prerequisite policy, learning paths | Date/timezone correctness, old courses unchanged |
| LMS-404 | Additional integrations/webhooks and scalable media adapters | Signing, retries, SSRF, optional provider resilience |
| LMS-405 | Plugin release and licensing distribution, only if desired | Offline/self-hosting and operator control preserved |

**Gate:** separate feature ADR/security/billing review; never add checkout by directly using provider secrets in LMS or bypassing core.

## Cross-repository critical path

`EXT-0xx design → EXT-1xx install → EXT-2xx scoped APIs/data → EXT-3xx admin/web → LMS-101..106 → LMS-201..206 → Pro optional → Commerce conditional`.

EXT-401..404 (async, backup, trusted release hardening) must be complete before public LMS MVP release even if the pilot starts without background jobs.

## Acceptance standards for each ticket

1. Pick relevant roles, inspect host contract and closest existing pattern, record impact on both repos.
2. Implement smallest compatible version with shared validated inputs, no unsafe casts or deep imports.
3. Unit tests then host SDK contract tests then API/e2e/integration as risk requires.
4. Test authorized success, unauthenticated, wrong role, wrong publication, not found, invalid input, concurrency, disabled state, retries when relevant.
5. Review new migration with non-empty preexisting data, lock/backfill, recoverability and operator instructions.
6. Test English/Arabic RTL, keyboard, accessible UI, default/external themes, privacy/SEO, Docker/reverse proxy.
7. Review scope-only diff and CI; state **Status | Role Review | Changed | Validation | Compatibility | Security | Blockers** truthfully.

## Release acceptance (no invented time commitments)

- User can create/publish course and enroll/complete as real Member through secure host boundary.
- Old data retained on disable, uninstall and upgrade; backups reliably recover course/progress.
- Core plugins, themes and member/billing behavior unchanged.
- No cross-publication or private-content leak in API, SSR, theme models, caching, jobs and media.
- All tests + operator smoke on tested versions green; documented compatibility matrix.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Core host extension interfaces are incomplete | Hard blocker; design docs and test fixtures until platform released |
| Admin/Next.js dynamic surface collision | Reserved public routes and isolated admin container |
| Misusing Member identity or billing subscriptions | Host-mediated verified identity and distinct course entitlements |
| Content model publishes private lessons | Separate protected LMS store and strict public projection |
| Complex online quiz concurrency | Transactional idempotency, snapshots and versioned grading |
| Upgrade breaks paid learners | Staged schema, canary publication, backup/restore drill |
| RTL and theme incompatibility | Shared sanitized view-model + tested fallback UI |

### Next authorized engineering step

After these documents are reviewed: file EXT-001..004 in Vibress, publish an approved host contract fixture, then implement **LMS-101** in this repo. Do not implement against speculative mock SDK exports.
