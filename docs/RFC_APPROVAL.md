# Vibress LMS — architecture RFC review and design approval

**Decision:** APPROVED AS ARCHITECTURAL BASELINE FOR IMPLEMENTATION  
**Date:** 2026-10-19  
**Implementation:** NOT STARTED. **No installable LMS package, schema migration, admin/learner page, plugin conformance run or working paid entitlement is delivered by this record.**  
**Approval basis:** Project-requested architecture decision, reconciled to the accepted Vibress [extension host ADR](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/adr/2026-10-19-external-extension-host-vnext.md). No separate named human Security/DB/QA signoffs are represented as completed.

## Adopted design decisions

| Area | Adopted direction | Pending implementation/verification |
| --- | --- | --- |
| Extension boundary | Independent package in `AbdullahZaher/vibress-lms`, no plugin-specific Vibress core patches/private imports | External trusted host, public SDK + working sample/ABI compatibility |
| Content / locale | Canonical stable course/section/lesson identities, translations keyed by publication/course/lesson/locale | Published translation/fallback and SEO/RTL privacy tests |
| Protected lesson media | Body and locale-specific media belong to localized lesson rows; intentionally shared media requires explicit same-course asset relation | Authenticated private media grants, same-course FKs and negative tests |
| Member / Staff | Staff roles and Member sessions separate; host resolves publication and explicitly verifies Member publication equality | Cross-publication, forged IDs/cookies, wrong owner and CSRF/origin tests |
| Data | Plugin-owned namespaced, typed, host-mediated repositories, forward-only migrations and transactional progression | Host storage ABI, populated upgrade/rollback/restore/retry and FK checks |
| Admin / Web | Studio navigation references a registered Staff-only `viewId`; public course routes use `/extensions/:pluginId/*`; protected lessons use Member scope | Route/asset collisions, CSP, SSR/cache privacy, accessibility and theme fallback |
| Trust / availability | Operator-installed, verified trusted package; in-process trusted runtime **not** a sandbox nor hard crash containment | Separate runtime ADR for strong isolation; package digest and health/failure verification |
| Jobs / events | Namespaced, idempotent versioned host-managed jobs for production; internal pilot may be synchronous | EXT-401 worker host and duplicate/replay tests before public MVP |
| Commerce | Core Billing is payment truth; LMS enrollment/course entitlement is distinct | One-time checkout requires new host contract; licensing of LMS Pro separately reviewed |

## Explicitly not approved/frozen

- Illustrative TypeScript types, exact `hostApi.major` number, package wire format, permission string set, concrete public endpoints and Postgres DDL are **design examples** pending formal host SDK/runtime-schema publication and migration review.
- LMS Pro feature licensing/commercial terms and offline grace remain [proposed](LICENSING_AND_ENTITLEMENTS.md), NOT adopted policy. Core paid-access one-time checkout is not promised.
- Optional integrations, certificates, detailed assessment/gradebook schemas, proctoring, marketplace uploads and hostile-code sandbox are not part of accepted MVP.
- No claim is made that prior role discussion equals external independent signoffs or passing CI.

## Role review summary

- **Architect / Plugin Reviewer:** separate independently versioned package and explicit host ABI; old plugin contract migration requires verified consumer inventory.
- **Security:** authoritative publication, Staff/Member separation, protected media/locale fallback, trusted in-process runtime with honest failure semantics.
- **DB/Migration:** stable identities, same-course composite keys, Member FK limitation, additive migrations and non-destructive disable.
- **API:** registered admin/member/public handler policies; plugin schemas through public SDK and host `@vibress/api-contracts` adapter; no direct database.
- **i18n/RTL / Theme:** localized content under canonical IDs; accessible fallback, mixed-direction navigation, private cache/SEO protections.
- **QA/Ops:** proof-of-host pilot then production gates; independent release conformance + Docker/backup/recovery and real audit evidence.

This is an architecture/documentation review, **not a claim of human release approval**. Actual reviewer acknowledgements belong to implementation PRs and release notes.

## Dependency gates

1. **RFC/ADR acceptance (this document):** authorize work on scoped `LMS-001..004` planning and host `EXT-001..004` implementation, not an executable LMS yet.
2. **Start LMS integration pilot:** host EXT-101..104 trusted install, EXT-201..204 authenticated/scoped data/API, minimal EXT-301/302 Studio/Web routing, and published independent SDK contract fixtures. Then LMS-101..106 implements proof for core EXT-501.
3. **Before public LMS MVP:** all core EXT-301..304, EXT-401..404 and EXT-501..504 pass, plus LMS-201..206, real negative security/tenant tests, migration/recovery/Docker, accessibility/RTL/themes, private media and multi-node rollout. Exact release versions/support matrix are measured and published.
4. **Before Pro/paid functionality:** separately approve quizzes/certificates, commercial licensing and one-time commerce integration; preserve existing learner records and free/self-hosted operation.

## Design acceptance vs implementation acceptance

**Accepted:** architecture direction in [ADR-0001](adr/0001-extension-boundary.md) and [ADR-0002](adr/0002-course-localization-and-relations.md).  
**Not implemented:** packages, host APIs, Drizzle schema/SQL, UI assets, migrations, worker jobs, billing checkout, CI.  
**Not frozen:** concrete SDK exports and package schema.  
**Release blockers:** accepted RFC decisions do not waive auth, publication scoping, signed/pinned artifact, migration safety, language/accessibility, host contract and upgrade tests.

No code or runtime tests were run in accepting this documentation-only decision.
