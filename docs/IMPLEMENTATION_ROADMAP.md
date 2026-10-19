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
| LMS-002 | Review both plugin SDK shapes, adapter, typed host contract, trusted external lockfile and UI package format | Canonical host ABI accepted, v1/legacy migration documented, no internal archive self-checksum |
| LMS-003 | Approve [ADR-0002](adr/0002-course-localization-and-relations.md): stable course IDs, locale rows, same-course composite keys | Safe translated slugs/progress, no cross-course or private Content Modeler leakage |
| LMS-004 | Member/publication equality, paid media, Staff/learner boundaries, Pro licensing vs course entitlements | Valid Member B session denied on A publication; policies and denial matrix approved |

**Gate:** EXT-101..104, EXT-201..204 plus minimal EXT-301/302 interfaces usable; otherwise work remains design/prototype, not production plugin.

## Wave 1 — End-to-end thin vertical slice (integration pilot)

| Ticket | Deliverable | Acceptance |
| --- | --- | --- |
| LMS-101 | Independent package skeleton, pinned host SDK, manifest and operator install docs | Build/test against published host fixture; no private imports |
| LMS-102 | Migration `0001`: canonical course/lessons **without localized body/media**; published lesson translation body/media, explicitly shared assets, enrollments and progress | Non-empty/fresh migration tests, SQL composite FK cross-course rejection, member-FK decision and locale invariants |
| LMS-103 | Minimal admin course draft/publish API and UI | Authorized Staff only; input/runtime schemas; origin/role tests |
| LMS-104 | Public course catalog plus published, privately authorized localized lesson; registered Studio `viewId` is separate | Draft invisible, safe metadata, locale/SEO, accessible fallback |
| LMS-105 | Member enrollment and completion via host-verified publication and same-course constraints | B Member on A publication denied, idempotency, cross-course, wrong owner, disabled plugin |
| LMS-106 | Dual-publication integration and Docker deploy rehearsal | One enabled/one disabled; upgrade/re-enable preserves learner data |

**Gate (pilot acceptance):** No LMS-specific core patch, two themes, English+Arabic RTL, public/private separation, real host conformance tests pass.

## Wave 2 — MVP course and learner experience

| Ticket | Deliverable | Acceptance |
| --- | --- | --- |
| LMS-201 | Course curriculum builder, section ordering, draft/published transitions | Transactional saves, revision policy, invalid state rejection |
| LMS-202 | Learner course dashboard, lesson resume, course progress | Correct counts on duplicates/curriculum edits, accessible states |
| LMS-203 | Admin enroll/unenroll controls, staff permissions and learner list pagination | Audited, publication-scoped, least-privilege exports |
| LMS-204 | Stable canonical lesson IDs + locale-owned restricted body/media + explicitly shared assets, per-locale SEO | No reset on locale change, duplicate slug/fallback tests, Arabic RTL, noindex/private content |
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
| LMS-405 | Separate [LMS Pro license](LICENSING_AND_ENTITLEMENTS.md), offline/revocation and release distribution, after business approval | Signed feature claims, outage/expiry, no data loss, free self-hosted functionality unaffected |

**Gate:** separate feature ADR/security/billing review; never add checkout by directly using provider secrets in LMS or bypassing core.

## Cross-repository critical path — internal pilot vs production

**Internal pilot prerequisites:** approved EXT-001..004 contracts, EXT-101..104 trusted external loader, EXT-201..204 scoped APIs/data and **minimal** EXT-301/302 Studio/Web host surfaces. Then LMS-101..106 implements core EXT-501. Pilot enrollment/progress remains synchronous until EXT-401 is available; do not register pretend worker handlers.

**Production gate:** full EXT-301..304, EXT-401..404, EXT-501..504, LMS-201..206 and the independent security/RTL/backup/multinode release matrix must pass before announcing LMS MVP or stable host SDK. EXT-504 follows pilot evidence and operational verification, never the reverse.

Core `EXT-0xx design → EXT-1xx trusted install → EXT-2xx authoritative scope/typed data → minimal EXT-3xx admin/web → LMS-101..106 → LMS-201..206 → Pro optional → Commerce conditional`. **LMS-101..106 is the pilot** used to complete EXT-501..504; never require finished EXT-501 before LMS-101 starts.

EXT-401..404 (async, backup, trusted release hardening) must be complete before public LMS MVP release even if the pilot starts without background jobs.

## P0 remediation mapping

- SDK dual shapes/event/deactivate: EXT-001/102/104 + LMS-002.
- Member publication binding and legacy settings: EXT-103/202 + LMS-004/105.
- Host [typed scoped repository and runtime schema contract](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-storage-contract.md): EXT-004/201/203 + LMS-002/102; no private `@vibress/api-contracts` imports, raw DB/SQL or `unknown` transaction objects.
- Same-course FKs, stable canonical identities, locale-specific protected lesson body/media and shared-asset access: EXT-203 + LMS-003/102/104/204.
- Detached final artifact digest and versioned UI/SSR/Worker: EXT-101/301/302/401 + LMS-101/103/104.
- Pro licensing separate from learner access: LMS-401/402/405 and [license RFC](LICENSING_AND_ENTITLEMENTS.md).
These are review and acceptance dependencies, **not completed code**.

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
