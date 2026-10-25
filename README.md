# Vibress LMS

**Status: domain foundation + provisional external ESM free-course pilot; NOT PRODUCTION READY.** [RFC approval](docs/RFC_APPROVAL.md).  
**Design baseline:** 2026-10-19.  
**Repository:** private and independently versioned from [Vibress core](https://github.com/AbdullahZaher/vibress).  
**Proposed product:** self-hostable, publication-aware learning management extension, with Arabic/RTL and English support, inspired by the capability class of commercial WordPress LMS products. This is not affiliated with Tutor LMS.

> **Important:** Vibress `main` currently has a trusted bundled-plugin SDK/host, but **does not yet** install and run independent external packages, register plugin-owned routes/UI or execute plugin-owned migrations. All extension interface examples in this repository are **proposals**, not working current APIs. Do not ship the LMS until the host compatibility and security gates are implemented and independently verified.


## LMS-103 operator-approved course authoring addon (development only)

An **optional independent Staff-only** extension now implements bilingual
course draft/save/publish over Host-scoped storage and an opaque-origin
Admin editor, without changing the installed free-course Member pilot.
Run `npm run release:authoring` to generate an **unsigned, uninstalled**
review fixture. See [LMS-103 security, migration and acceptance](docs/LMS_103_COURSE_AUTHORING.md).
Published authoring records are **not yet** public/member-accessible; this
is a bounded authoring foundation, not the full LMS curriculum MVP.

## EXT-501 independent trusted Host pilot (new, provisional)

The EXT-205 Host Member storage bridge is now merged in Vibress core. This
branch includes an **opt-in external ESM pilot** with one fixed free course,
Arabic/English catalog metadata and protected text lessons, plus idempotent
Member-owned enrollment and completion records. The operator must review the
signed artifact and apply an approved model migration before any publication
can use it. No dynamic course authoring or paid entitlement is implemented.

Run `npm run verify:local` and `npm run release:pilot`, then follow
[the security/installation runbook](docs/PILOT_EXT205.md). The generated
`dist/pilot-release/trusted-plugins.json` is unsigned and is **not** an
installation or live Host acceptance test. The broader production blockers
listed elsewhere in this README remain applicable.

## Implementation snapshot (2026-10-20)

A small, executable **host-agnostic domain module** now exists in `src/domain/`: publication-scoped public course projection, guarded free-lesson access, paid-access fail-closed policy, course publishing checks (sections and published translations), safe free-enrollment decisions, locale-specific protected lesson references, course progress and duplicate completion classification. See [implementation status](docs/IMPLEMENTATION_STATUS.md).

Run `npm install` then `npm run typecheck` and `npm test` (Node >=22). **No host adapter, plugin manifest, host-registered migration, persistent enrollment, API route, Studio page, or protected media delivery exists yet.** Domain-level `VerifiedMemberScope` is an input contract, **not proof of authentication**; the host must authenticate and independently match the Member to the resolved publication.

## Host-scoped pilot application service (current branch)

The independent LMS repository now contains
`src/application/host-operations.ts`, which adds a production-oriented
application boundary for publication- and Member-scoped course projection,
free enrollment decisions, protected lesson reads, course progress and
idempotent lesson-completion decisions. It reuses the existing
LMS domain policy and requires a **host-authenticated Member resolver** plus
an **atomic, uniqueness-enforced, publication-bound repository adapter**.
This code is independently testable with `npm run verify:local`.

**Do not claim the LMS is installable yet.** Vibress core now exposes optional EXT-205 Member-owned transactional record
storage via Host-bound `scope.memberStorage`. The fixed free-course pilot
uses only that API, but the full LMS repository adapter, mutable courses,
cross-model transactions and paid-entitlement checks remain unimplemented. The LMS will not import
Vibress private database packages, deploy its candidate SQL directly or
grant Member routes generic Staff-level storage permissions. Host adapter,
approved migration/restore tests and deployed bilingual/RTL E2E are required
to close EXT-501 through EXT-504.

## Database migration candidate

LMS-102 includes a review-only, forward-only [PostgreSQL schema proposal](migrations/0001_initial.sql), [upgrade/security notes](docs/MIGRATION_0001.md), and a disposable PostgreSQL integrity fixture (`npm run test:db`). **Do not apply it to production or import database internals**: Vibress core must first implement and approve EXT-203's migration runner and typed repositories.

## Product objective

Allow a Vibress publication to create courses/lessons, enroll learners using existing **Member** identity, protect lesson media and content, track progress, and later support quizzes, instructor workflows, certificates, paid access, analytics and API clients — without modifying Vibress core per LMS feature or importing private packages.

## Documentation map

| Document | Purpose |
| --- | --- |
| [RFC review and architectural approval](docs/RFC_APPROVAL.md) | Decisions accepted for implementation, deferred public contracts and release gates |
| [Product requirements](docs/PRODUCT_REQUIREMENTS.md) | Actors, use cases, MVP vs Pro, non-functional criteria |
| [Architecture](docs/ARCHITECTURE.md) | Components, boundaries, data flow, rendering, self-hosting |
| [Integration contracts](docs/INTEGRATION_CONTRACTS.md) | **Proposed** host APIs, capability dependencies and compatibility |
| [Data model](docs/DATA_MODEL.md) | Plugin-owned tables; canonical lesson identity, locale-owned body/media, scoped relations and migrations |
| [Canonical course identity, locale and FK ADR](docs/adr/0002-course-localization-and-relations.md) | Same-course constraints and stable translations/progress |
| [Pro licensing vs learner entitlements](docs/LICENSING_AND_ENTITLEMENTS.md) | Separate optional paid-feature license from student access |
| [Security and operations](docs/SECURITY_OPERATIONS.md) | Tenant isolation, auth, paid media, threats, backups, incident response |
| [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md) | Vertical slice, waves, tickets, dependencies and acceptance gates |
| [Test and release strategy](docs/TEST_RELEASE.md) | Automated matrix, upgrade paths and release checklist |
| [ADR 0001](docs/adr/0001-extension-boundary.md) | Trusted extension boundary and rejected alternatives |

Core platform architecture **accepted for implementation on a separate docs branch (not merged or shipped)**: [Plugin platform architecture](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-architecture.md), [contracts](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-contracts.md), and [roadmap](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-roadmap.md). These are draft links, not yet stable merged specifications.

The planned [Vibress typed storage/runtime validation contract](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-storage-contract.md) is a proposed public SDK design, **not a callable API**. Studio course navigation uses registered `adminViewId`, not public course URLs. Trusted in-process code is not isolated against fatal crashes; a production hard-isolation promise needs a supervised process/container design.

## Intended milestones

1. **Host prerequisite (core):** operator-installed package, publication enablement, route/API/UI/data contracts and secure migration runner.
2. **Integration spike:** install/enable LMS; admin course page, one published free course, member enrolls and reads one protected lesson, with two-publication isolation.
3. **LMS MVP:** sections, lessons, enrollment, progress, essential admin/learner UX, translation-ready pages, data and recovery tests.
4. **LMS Pro:** assessments, advanced instructor workflows, certificates, reports, paid access integrations, lifecycle automation after independent approval.

The pure domain module has real build and unit-test commands. Creating an installable plugin manifest/host integration remains blocked until the host contracts are approved and tested; do not create fake integration checks.

## Design principles

- Existing Staff and Member identities are different principals. No direct core DB, Staff sessions, billing secrets or private imports.
- All course/enrollment/progress records are publication-scoped; IDs do not authorize access. A Member session must match host-resolved publication; course-section-lesson-enrollment-progress links require same-course composite keys.
- Editorial catalog may reuse Content Modeler via a documented API; private lessons, answer keys, gradebook and progress remain under protected LMS domain ownership.
- Core Billing remains source of payment/subscription truth; enrollment and course entitlements are separately checked by LMS. One-time purchases are **not assumed** supported by existing recurring subscription APIs.
- Disable/uninstall preserve learner records by default; upgrade and restores are operational contracts.
- Arabic, RTL, keyboard, accessible media controls, SEO and safe localization are release criteria, not enhancements. One canonical course/lesson ID owns all translated variants without resetting student progress. LMS Pro licensing is separate from paid-course entitlement and requires later approval.

## Team process

Every nontrivial ticket begins with relevant Architect/Security/DB/API/Plugin-Theme/i18n/QA roles, then a scoped implementation plan. Protect backward compatibility with old persisted data and deployed themes. Apply least privilege and shared runtime validation. Finish with tests, diff inspection, compatibility notes, operator docs and an explicit blocker list.

**حالة المشروع:** أُنجزت طبقة منطق الدورات والتقدم الدراسي واختباراتها الأولية، لكن الإضافة ليست جاهزة للتثبيت أو الاستخدام الفعلي. يلزم اكتمال واجهات الإضافات الخارجية والتخزين الآمن واختبارات الدمج أولاً.

## EXT-502: Real Host HTTP acceptance (operator-managed)

The fixed-course Pilot from the merged stacked branch is included in this integration PR.
Run `npm run host:acceptance:test` to test the acceptance client against disposable
loopback fixtures; run `npm run host:acceptance` against **two independently
configured real Vibress publications** using three fresh test Member sessions.
The client is read-only by default and requires explicit `LMS_HOST_ALLOW_WRITES=1`
for enrollment/progress mutations. See [EXT-502 acceptance runbook](docs/HOST_ACCEPTANCE_EXT502.md).
Neither local HTTP mocks nor the release fixture prove real Host installation.
Automatic GitHub Actions triggers are temporarily paused on `main`; the full
suite remains available via manual `workflow_dispatch` and must pass before release.

## Experimental Native course overview (NUI-05)

A separate, **read-only** Host-native course overview has been added on the Native UI pilot branch. It does not replace the legacy course-authoring iframe and does not enable generic storage mutations for LMS. See [Native overview pilot and release gates](docs/NATIVE_ADMIN_UI_PILOT.md) for operator and security requirements. No signed or deployed artifact is implied.
