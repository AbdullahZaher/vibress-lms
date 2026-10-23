# LMS-103 — Safe, opt-in Staff course authoring (development release)

**Scope:** a first, separately installed Staff-only course-draft/publish vertical
slice. **Not a commercial LMS MVP, not a replacement of the existing
`vibress-lms-pilot`, and not production approved.**

## What is implemented

- New independent Host-approved ESM extension:
  `src/extension/course-admin.mts` →
  `dist/authoring-release/vibress-lms-authoring.mjs`.
- Manifest: `vibress-lms-authoring`. This **different manifest ID**
  intentionally avoids modifying the existing, independently installed
  `vibress-lms-pilot` artifact, ledger, or Member progress.
- Publication-scoped Host `scope.storage` model named `courses`.
  New course IDs are locale-neutral and immutable; there are eight bounded
  localized fields (English/Arabic metadata and one required protected text
  lesson) plus status. Drafts may be incomplete.
- Host-authorized `GET/POST /api/admin/v1/extensions/vibress-lms-authoring/v1/courses`
  with `plugins.manage`, Staff authentication, Origin validation and local
  owner/admin role admission **enforced by Vibress Host**. The extension
  cannot choose publication IDs, auth tokens, member IDs or raw SQL.
- `POST` actions `create`, `save`, `publish`: optimistic record version,
  conflict handling, complete bilingual content required before publishing,
  exact saved revision required for publish, and immutable published records.
  There is deliberately no destructive delete or silent draft overwrite.
- Optional signed Admin UI `assets/courses.html`, a standalone
  opaque-origin iframe via `adminViews/adminNavigation`. It uses only the
  Host-linked read/write MessagePort bridge (each write needs Host-controlled
  confirmation), with Arabic/RTL and keyboard-friendly labels.
- Admin editor displays the **first** existing course in a publication.
  This is a deliberately limited vertical slice, not a paginated curriculum
  manager. Direct Host-authenticated Admin routes can address further IDs
  for draft/publish; fuller editing/navigation is LMS-201 work.
- **No public course catalog or learner access changes** in this ticket.
  Even `published` courses remain invisible to public and Member routes
  until LMS-104 defines reviewed curriculum, projections and enrollment
  compatibility. Protected lesson text is never exposed by a public route.

## Build and unapproved release review

```sh
npm install
npm run verify:local
npm run release:authoring
```

This generates `dist/authoring-release/` containing:
`vibress-lms-authoring.mjs`, `courses.html`,
`trusted-plugins.json` and `operator-migration-plan.json`.

**These files are UNSIGNED and UNINSTALLED**. Never use the generated
lockfile directly as the global production operator lockfile. Follow
[Vibress's operator runbook](https://github.com/AbdullahZaher/vibress/blob/main/docs/08-plugins/external-extension-operator-runbook.md):

1. Pin/review the final code, dependencies, static Admin UI and built bytes.
   Scan both source and output; never treat pinned SHA-256 as malware isolation.
2. Merge the manifest and model declaration into the complete global lockfile.
   Sign its exact bytes offline using an operator-controlled Ed25519 private key.
   Mount only the trusted, read-only public key/signature/artifacts to API/Worker.
3. Take and verify backups. Apply **new addon** migration
   `0001_lms_authoring` through the core read-only plan preflight and
   separate consent-checked migration executor while this addon is inactive.
   The one new physical model is `courses`. Do **not** apply LMS standalone
   `migrations/0001_initial.sql` to core or modify released core migrations.
4. Register the new manifest through the existing operator-only
   `/api/admin/v1/plugins/register-trusted` endpoint (or the Add Plugin
   Admin UX after the separate EXT-507 branch is reviewed and merged),
   activate independently and enable only the approved test publication.
   Never automatically enable any other publication.
5. Exercise Staff owner/admin, editor, anonymous and Member restrictions;
   valid/wrong Origin writes; two-publication isolation; CAS races;
   bilingual content; duplicate registration; deactivate/reactivate; and a
   disposable restore with the signed release and migration ledger.
6. Review logs for no sensitive content, check multiple API replicas and run
   manual LMS CI plus local tests before release.

## Lifecycle / compatibility

The previous `vibress-lms-pilot` remains byte-for-byte unchanged, with the
same free lesson IDs, enrollments, Member records, published catalog,
`0001_lms_pilot` ledger and capabilities. Installing this addon does not
migrate old Member content or turn authored courses into Member-accessible
content. The new manifest ID intentionally prevents accidental modification
of legacy Member storage semantics; convergence into a single professional
plugin needs a separately reviewed upgrade/data mapping plan.

Host API shape bounds are 24 scalar fields, 4096 characters per route string
and only Host-mediated, per-publication storage operations. Each write
uses a single atomic CAS on a single course record. Bilingual lesson content
and publication metadata share that record so a publish operation needs no
unsafe cross-model transaction.

## Tests / remaining work

`test/course-admin.test.mjs` checks positive/negative draft/publish flows,
stale writes, concurrent creates, cross-publication mock isolation and
the unsigned release's digest descriptors. This is **not** proof of real
PostgreSQL, signed Host acceptance or browser UI tests.

Further steps: disposable live Fastify/PostgreSQL Admin acceptance; a
paginated multi-course editor; versioned curriculum/section/lesson storage;
course translation/SEO; real public and Member routes (LMS-104/105);
paid entitlements, protected media and full RTL browser checks.

Automatic LMS GitHub Actions triggers remain disabled
(`workflow_dispatch` only), as requested.
