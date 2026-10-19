# ADR-0001 — LMS as an externally versioned trusted Vibress extension

**Status:** PROPOSED  
**Date:** 2026-10-19

## Context

LMS requires course authoring, enrollment, progress, protected lessons, assessments and later commerce. Building LMS directly inside Vibress core would couple releases, migrations and theme behavior to one vertical. Existing `@vibress/plugin-sdk` provides minimal trusted plugin hooks but cannot yet load third-party packages, register API/Studio/Web routes or own migrations.

## Decision

- Develop LMS in the **separate** `AbdullahZaher/vibress-lms` repo, versioned independently.
- Vibress maintains an operator-installed **trusted plugin host** with explicit SDK/service boundaries. The LMS imports only public SDK contracts; host controls publication/principal authorization, routing and plugin installation.
- LMS owns a namespaced dataset and migrations with host-controlled upgrade lifecycle. Core maintains identity, payment/subscription truth and platform operations. No direct private Drizzle/domain imports.
- In-process plugin code is **trusted/audited**, not sandboxed. Unknown publisher code requires separate runtime isolation design and is rejected in this architecture.
- Use reserved public route namespace initially with SEO-aware default renderer and optional approved theme slots; no changes to every installed theme.
- Keep activation per publication and preserve learner data on disable/uninstall.
- Defer one-time payments until there is an explicit provider-neutral core extension contract.

## Alternatives and consequences

1. **Fork/modify Vibress core for LMS:** rejected; breaks independent release, third-party compatibility and maintenance.
2. **Pure remote SaaS:** rejected as required deployment; violates self-hosting autonomy and complicates identities/offline operation. Optional service integrations remain possible.
3. **Separate LMS microservice from day 1:** valid alternative if trust/security requires process isolation; adds deployment/network complexity. Reassess for untrusted code, scaling or high-risk media processing.
4. **Content Modeler only for all LMS data:** rejected; learner/gradebook/protected content need transactional private tables and stronger authorization.
5. **In-process arbitrary uploaded ZIP:** rejected; SDK capabilities and `node:vm` are not security sandboxes.

## Conditions for acceptance

Platform EXT-0xx contracts + threat model approved, independent package installs without core edits, protected member lesson and course admin pass two-publication tests, upgrade/backups and RTL/theme fallback verified. Then promote this ADR to Accepted with commit links, contract versions and real validation evidence.

Related: [architecture](../ARCHITECTURE.md), [integration prerequisites](../INTEGRATION_CONTRACTS.md), [roadmap](../IMPLEMENTATION_ROADMAP.md).
