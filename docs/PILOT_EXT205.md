# EXT-501 provisional independent LMS Host pilot (October 2026)

**Operator-reviewed acceptance fixture; NOT an LMS MVP or production-ready plugin.**
Vibress core [EXT-205 / PR #80](https://github.com/AbdullahZaher/vibress/pull/80)
merged the optional `scope.memberStorage` API. This increment demonstrates a
self-contained external plugin with one immutable, free, bilingual course and
two protected text lessons. It cannot create/edit courses, sell access, serve
protected media, issue certificates, or access a real private LMS database.

## Contracts and security boundary

- The artifact is a **single** `.mjs` ESM file. It only uses the public SDK
  shape `PluginModule.routes`, `publicViews`, and optional `PluginApiScope.memberStorage`.
  Because the SDK package is currently private, compile-time public SDK parity
  is *provisional* and requires cross-repository verification against the
  exact deployed Vibress SDK before release. No internal DB/Host modules import.
- Routes: public `GET catalog`; authenticated Member `POST enroll`,
  `GET lesson`, `POST complete`, `GET progress`. Requests are subject to the
  Host's actual Member auth, CSRF/Origin, publication routing, method and
  runtime scalar-shape validation. The plugin cannot choose the principal,
  publication or storage model descriptor.
- Host must approve both `enrollments` and `completions` in an immutable
  plugin migration ledger and physical-model catalog; Member data lives in
  `plugin_member_records` and **not** those physical Staff tables.
- A key scoped by (plugin, publication, Member, model, record ID) atomically
  admits free enrollment and lesson completion. Concurrent inserts return a
  conflict, which the plugin re-reads and treats as successful only if the
  persisted row has the exact expected identity and active state. Revoked
  enrollments are never reactivated implicitly. A provider failure propagates.
- There are NO member ID, publication ID or payment flags in route bodies or
  persisted fields. Completion reads enrollment first; course and lessons are
  fixed and operator-pinned. Runtime Member storage independently checks live
  plugin publication enablement/Member status on every DB operation. A true
  cross-model enrollment+completion transaction is **not** available yet;
  do not extend this prototype to mutable/paid courses without that contract.
- Public content is deliberately restricted to localized plain-text metadata
  with no private lesson content. Member lesson text is returned only after
  active enrollment. Invalid locale is denied (no implicit fallback).
- The Host runs trusted JS inside its API process. An operator must audit the
  bundle, sign the exact lockfile, and accept that this is NOT a JS sandbox.

## Build and operator preparation

```sh
npm install
npm run verify:local
npm run release:pilot
```

`dist/pilot-release/` contains an **UNSIGNED and NOT INSTALLED** sample
`vibress-lms-pilot.mjs`, `trusted-plugins.json` and
`operator-migration-plan.json`. Hashes cover the exact compiled bytes and
reviewed field schemas. `prepare-pilot-release.mjs` does not sign, upload,
install, activate or bypass any operator approval. A release candidate must:

1. Pin the Vibress core revision including EXT-205, verify SDK API/route
   compatibility, and independently review source and compiled artifact.
2. Register the manifest while inactive through the operator-authorized
   plugin registry; apply the **operator-approved** forward migration using
   the core physical-model migration service. This action creates only the
   2 approved Staff physical metadata-model tables and reserves the namespace.
   The `plugin_member_records` table comes from core migration `0045`; never
   run the standalone `migrations/0001_initial.sql` against Vibress to deploy
   this pilot. Do not auto-execute JSON plans from an untrusted extension.
3. Place immutable release bytes in an operator-controlled directory. Add
   this lockfile entry to the global approved lockfile without replacing
   other installed plugins. Recompute and **operator-sign** the exact final
   lockfile with Ed25519, keeping the signing private key offline. Use the
   official Vibress runbook and `compose.plugins.yml` to preflight all replicas.
4. Only after the signed release and migration are verified: activate the
   plugin and enable it on a deliberately chosen test publication. Create
   distinct Members in publication A and B and test the true Host HTTP routes.
   Deactivation/disablement must deny access without purging learner state.
5. Verify a member can enroll, read Arabic/English published lesson text and
   complete the same lesson idempotently, while a second Member and a second
   publication remain isolated. Test revocation, invalid sessions, invalid
   Origin/CSRF, stale lockfile, migration mismatch, disabled publication,
   retry races, failure/restore and real theme/RTL rendering.

## Required release gates not covered by local tests

The Node tests use a fake Host storage implementation. They are useful for
contract/policy and idempotency behavior, but do not prove real Vibress
Fastify/Next.js integration or PostgreSQL schema upgrade success. Separate
real installed Host E2E, Docker/multi-replica, backup restore, large database
upgrade, Admin UI/authoring and protected-media acceptance are mandatory.
No paid enrollment or course purchase may be enabled from this fixture.

## EXT-502 installed Host acceptance

Use [the real HTTP acceptance runbook](HOST_ACCEPTANCE_EXT502.md) for two
publication sessions, signed operator release setup, authentication and Origin
negative cases. Its isolated client tests are not proof that a live Host
installation passed. Run all documented production gates before release.
