# ADR-0001 — LMS as an externally versioned trusted Vibress extension

**Status:** Accepted — architecture direction; external host SDK and LMS features NOT implemented. [RFC approval](../RFC_APPROVAL.md).  
**Date:** 2026-10-19

## Context

LMS requires course authoring, enrollment, progress, protected lessons, assessments and later commerce. Building LMS directly inside Vibress core would couple releases, migrations and theme behavior to one vertical. Existing `@vibress/plugin-sdk` provides minimal trusted plugin hooks but cannot yet load third-party packages, register API/Studio/Web routes or own migrations.

## Decision

- Develop LMS in the **separate** `AbdullahZaher/vibress-lms` repo, versioned independently.
- Vibress maintains an operator-installed **trusted plugin host** with explicit SDK/service boundaries. The LMS imports only public SDK contracts; host controls publication/principal authorization, routing and plugin installation.
- LMS owns a namespaced dataset and migrations with host-controlled upgrade lifecycle. Same-publication **and same-course** relations, locale-independent course IDs, and translation slugs follow [ADR-0002](0002-course-localization-and-relations.md). Core maintains identity, payment/subscription truth and platform operations. No direct private Drizzle/domain imports.
- In-process plugin code is **trusted/audited**, not sandboxed. Unknown publisher code requires separate runtime isolation design and is rejected in this architecture.
- Use reserved public route namespace initially with SEO-aware default renderer and optional approved theme slots; no changes to every installed theme.
- Keep activation per publication and preserve learner data on disable/uninstall.
- Defer one-time payments until there is an explicit provider-neutral core extension contract. Commercial Pro licensing has a [separate offline/self-hosting proposal](../LICENSING_AND_ENTITLEMENTS.md) and cannot substitute for learner course entitlement.

## Alternatives and consequences

1. **Fork/modify Vibress core for LMS:** rejected; breaks independent release, third-party compatibility and maintenance.
2. **Pure remote SaaS:** rejected as required deployment; violates self-hosting autonomy and complicates identities/offline operation. Optional service integrations remain possible.
3. **Separate LMS microservice from day 1:** valid alternative if trust/security requires process isolation; adds deployment/network complexity. Reassess for untrusted code, scaling or high-risk media processing.
4. **Content Modeler only for all LMS data:** rejected; learner/gradebook/protected content need transactional private tables and stronger authorization.
5. **In-process arbitrary uploaded ZIP:** rejected; SDK capabilities and `node:vm` are not security sandboxes.

## Implementation and production release gates (not prerequisites to the ADR design decision)

The architecture direction is accepted by project request and documented in [RFC approval](../RFC_APPROVAL.md). Implementation is authorized **only** after host EXT-0xx contract review: dual SDK/v1 adapter, Member-publication binding, typed repositories, externally verified final archive, separately scoped Studio/Web and worker lifecycle. Before external **production** release: independently installed package without plugin-specific core edits; protected member lesson + Staff course editor with two-publication negative tests; nonempty upgrade/backup/restore; Arabic RTL, theme/accessibility, worker idempotency and Docker/multi-replica recovery must pass. These gates do not prevent accepting the direction; they block declaring the feature or SDK implemented/stable.

Related: [architecture](../ARCHITECTURE.md), [integration prerequisites](../INTEGRATION_CONTRACTS.md), [roadmap](../IMPLEMENTATION_ROADMAP.md).
