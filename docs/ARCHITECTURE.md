# Vibress LMS — system architecture

**Status: ACCEPTED ARCHITECTURAL DIRECTION — not implemented and dependent on not-yet-implemented Vibress external extension host.** [RFC approval](RFC_APPROVAL.md).

## 1. Deployment boundary

```text
Browser (Visitor / Learner / Staff)
    |                |               |
Vibress Web      Member API       Admin Studio
    \                |              /
     Vibress API — authenticated, publication-scoped extension host
                   |
           versioned LMS SDK facade
                   |
       LMS domain handlers (trusted package)
            /          |           \
     LMS data         jobs        core facade
     own schema    via worker   members, content,
                                subscriptions (read)
```

The LMS is an **independently released package/repository**, not a new Vibress monorepo domain. Production deployment initially uses **operator-installed vetted trusted code**. In-process trusted code does not have a credible hostile-code sandbox; for less-trusted deployments use a separately designed service/container boundary and authenticated API, subject to an ADR and operational tradeoffs.

## 2. Code structure after host contract approval (target, not present)

```text
vibress-lms/
  src/
    server/          # plugin entrypoint; registration adapters
    domain/          # courses, enrollment, progression, assessment rules
    application/     # use cases; authorization via host facade
    infrastructure/  # plugin-owned repository adapters/migrations/jobs
    contracts/       # public, admin and member runtime schemas
    admin/           # isolated UI contribution bundle
    web/             # public and member presentation view models
    i18n/            # ar/en resources and locale negotiation
  migrations/        # immutable namespaced migrations
  tests/             # unit, host-contract, multi-publication, e2e, recovery
  docs/
```

Follow the host's public packages and tooling; this tree is a proposed layout, not a requirement to import private modules.

## 3. Dependency direction

`routes/UI descriptors → application use cases → LMS domain → interfaces → host-provided typed services and plugin-owned repositories`.

- **Vibress owns:** identities, sessions, publication context, staff authorization, general Content Modeler, billing payment truth, operator plugin installation/lifecycle, shared queues and renderer boundaries.
- **LMS owns:** course structure and visibility policy, lesson ordering, enrollment, progression, quiz attempt/gradebook, certificate records, domain events and course-level entitlement decisions.
- **Host enforces:** capabilities, authenticated publication and caller, schema validation, safe API routing, request and worker context, route/uninstall state.
- **No deep imports:** never import `@vibress/database`, `apps/api` internals, private auth/billing repositories, raw theme renderers, secrets or non-SDK core modules.

## 4. Domain boundaries and consistency

### Course/content

Store protected course/lesson data in the LMS-owned schema to keep atomic access control and avoid accidentally publishing data via public content collections. Course/section/lesson IDs are **stable across locales**; canonical lessons hold structural data only, while `lms_lesson_translations` owns locale-specific body/media refs with publication/course/lesson/locale keys. Explicit shared assets require a same-course FK and the same protected media rules. Section-to-course, lesson-to-section/course, and progress-to-enrollment/lesson use matching `(publication_id, course_id, ...)` composite candidate keys and FKs; see [ADR-0002](adr/0002-course-localization-and-relations.md). If editorial catalog uses Content Modeler, link course to a publication-scoped content entry via host-mediated documented service; do not require raw Drizzle access, and make catalog projection explicit and fail-closed. Draft → published → archived; unpublished lesson references remain private.

### Enrollment and learner identity

A Member is not Staff. Every learner mutation uses `memberId` from verified Member session and `publicationId` from host context **only after** the host checks `member.publicationId === independently resolved site publicationId`. General `requireMemberSession` does not enforce that equality by itself. Enrollment unique across (publication, course, member). Enrollment can be revoked/suspended while progress remains auditably stored. Cross-publication slugs and IDs must return not-found, not disclose the owner's publication.

### Entitlement

Enrollment alone does not necessarily grant access to paid course content. `canAccessLesson` must evaluate course visibility, member status, owned enrollment, per-course conditions, prerequisites, and current billing entitlement read through Vibress service (when enabled). A billing webhook is not itself proof of entitlement until the core billing state is reconciled. Prefer policy and paid content fail closed on provider outages while retaining verified cached grants only under documented bounded staleness rules.

### Progress and assessments

Use idempotent completion writes and transactions; all attempt timestamps and grading authoritative server-side. Quiz answer keys never returned before authorized review; track attempt/version, score, regrades and submission state. Completion percentages derive from published required lessons according to a documented versioning policy; reconcile historical progress when the course structure changes.

## 5. Surfaces and presentation

- **Admin:** `adminNavigation.viewId` resolves only to a registered staff-only Studio view under the host-computed Studio base path, **never** the public `/extensions/vibress-lms/courses` URL. Its separate Admin API remains under `/api/admin/v1/extensions/...`, with authorization per request. Staff role checks on every mutation, even if links are hidden.
- **Public web:** reserved `/extensions/vibress-lms/...` route until core collision-free aliases are approved; published SEO-safe course catalog and detail pages. Platform theme/locale contracts + accessible fallback first.
- **Learner:** Member API and course dashboard, protected localized lesson body/media resolved only after Member/publication/course/enrollment/entitlement and translation publication-state checks; private/no-store SSR/cache. Language fallback never leaks restricted media. Serve private media only through server-authorized short-lived grants.
- **Theme integration:** optional course card, catalog/detail slots with sanitized localized data. Never mandate modifications to existing themes.
- **i18n:** honor enabled locales and publication primary locale, BCP-47, mixed-direction text, Arabic RTL, accessible translated strings. Slugs and metadata belong to translation rows; enrollments and progress refer to locale-independent IDs.

## 6. Events and integrations

Proposed versioned events, after core event extension contract is approved:

- `lms.course.published.v1` (safe metadata only)
- `lms.enrollment.created.v1` (private, authorized downstream consumers)
- `lms.lesson.completed.v1` (no full PII)
- `lms.certificate.issued.v1`

Use durable event IDs and idempotent processing; event payload includes authoritative publication from host and does not grant permissions. Queue jobs can render certificate assets, recompute progress and send permitted notifications. Retries, worker restarts and disable must not duplicate results.

## 7. Fault-containment boundary

Trusted LMS code initially shares the Vibress Node.js process. Ordinary rejected handlers may be caught and fail closed. **Fatal in-process faults (OOM, CPU/event-loop blocking, `process.exit`, native crashes or global mutation) are not isolated; Vibress core continuity is not guaranteed.** Strong availability isolation would require separately supervised process/container execution and another security/operations ADR. No current in-process plugin is a reliable hostile-code sandbox.

## 8. Data migration, failure and operability

- Namespaced tables and migration ledger; expanding schemas, backfilling old records, then switching code; no rewriting released versions.
- Fresh install and upgrade from production-like data have equivalent constraints.
- Disable/re-enable retains data, blocks new work, drains existing jobs and fails safely on unfinished migration.
- Backup/restore includes course data, learner data, restricted assets and encryption secrets, plus pinned plugin artifact version.
- Observe requests/jobs by requestId, publicationId, courseId (where safe) and release version; redact PII and avoid high-cardinality telemetry dimensions.
- Deploy under Docker/reverse proxy with deterministic **externally digest-pinned final archives**, content-addressed Admin/Web assets, CSP and worker rollout contract; no mandatory licensed proprietary service for the free LMS. Pro licensing, if introduced, is a [separate operator decision](LICENSING_AND_ENTITLEMENTS.md), never proof of student payment.

## 9. Design decisions requiring explicit approval

1. Plugin-owned data access design in host SDK (recommended mediated typed repository; raw DB handle prohibited).
2. Whether public editorial course metadata is an LMS projection or linked Content Modeler model; avoid source-of-truth duplication.
3. Member/instructor permission model and association with Staff if instructors edit courses.
4. Commerce access rules and one-time purchasing after existing subscription integration.
5. Reserved vs vanity URLs and how Next.js host resolves them.
6. Optional video delivery adapter and signed playback/token revocation story.
7. Canonical `plugin-sdk` versus alternate `plugin-core` ABI, event/deactivate semantics, adapter/version policy.
8. Detached package digest and Admin/Web/Worker asset, SSR privacy, multi-replica and disablement behavior.
9. Same-course composite FK schema, stable translations, and license-vs-course-entitlement policy.

Related: [host integration](INTEGRATION_CONTRACTS.md), [data model](DATA_MODEL.md), [ADR](adr/0001-extension-boundary.md).
