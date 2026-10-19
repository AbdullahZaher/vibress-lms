# LMS ↔ Vibress host integration contract

**Status: PROPOSED; unavailable on Vibress main as of 2026-10-19.**  
Do not compile against example signatures until the platform's versioned plugin SDK and conformance suite are published.

## 1. Existing core capabilities (confirmed)

| Core surface | Source / constraint |
| --- | --- |
| Plugin SDK `PluginModule.activate`, `deactivate`, `onEvent` | `packages/plugin-sdk/src/index.ts` |
| Hard-coded trusted plugin host | `apps/api/src/plugins/plugin-host.ts`; cannot load arbitrary standalone LMS package |
| Staff plugin management | `apps/api/src/routes/platform.ts`, `plugins.read/manage`, origin validation |
| Member auth | `apps/api/src/middleware/member-auth.ts` and Member domain; distinct from Staff |
| Billing/subscriptions | `packages/domains/billing` and `member-billing` routes; payment/subscription authority stays core |
| Content model collections and theme integration | `packages/domains/content-modeler`, `apps/web/src/app/collections` and Liquid view models |
| Async jobs / outbound webhooks | Core BullMQ and delivery system; no generic plugin job registration API yet |

The core `@vibress/plugin-sdk` has a source-level `SDK_VERSION = "1.0.0"`, regardless of npm package version. Current manifest registration is **not** code installation. Capability labels are not all backed by invokable mediated services today.

## 2. Required host prerequisites (tracked in Vibress EXT roadmap)

| Host item | LMS need | Blocker |
| --- | --- | --- |
| EXT-101..104 | trusted external artifact, publication enablement, lifecycle | Cannot independently install/activate |
| EXT-201..204 | auth-scoped route handlers, scoped data, member/entitlement services | Cannot implement secure external domain APIs |
| EXT-301..303 | admin view, public route, locale/SEO/theme slots | Cannot deliver editor/learner UI |
| EXT-401..403 | worker registration, settings/backup/upgrade | Needed before production release |
| EXT-501..504 | cross-repo pilot and compatibility gates | Required for stable external integration |

See proposed [host contracts](https://github.com/AbdullahZaher/vibress/blob/docs/external-plugin-platform-plan-20261019/docs/08-plugins/external-extensions-contracts.md).

## 3. Package negotiation (illustrative only)

```json
{
  "id": "vibress-lms",
  "version": "0.1.0",
  "hostApi": {"major": 2, "minMinor": 0},
  "entrypoint": "dist/server/index.js",
  "capabilities": [
    "extension.routes.admin",
    "extension.routes.member",
    "extension.routes.public",
    "extension.data.own",
    "members.read-scoped",
    "extension.jobs"
  ]
}
```

This is a requirements example, **not** accepted schema. The final manifest adds audited artifact integrity, migration head, scoped permissions, settings and contribution schema. Package versions, SDK protocol versions, API endpoint versions and migration heads are independently versioned.

## 4. Proposed API paths

| Scope | Prefix | Auth/policy |
| --- | --- | --- |
| Admin courses | `/api/admin/v1/extensions/vibress-lms/v1/courses` | Authenticated Staff + `lms.course.manage`, origin check on writes |
| Member enrollments | `/api/members/v1/extensions/vibress-lms/v1/enrollments` | Member session, own-member ownership, origin/CSRF on writes |
| Member progress | `/api/members/v1/extensions/vibress-lms/v1/progress` | Member session, enrolled course, idempotency key |
| Public catalog | `/api/content/v1/extensions/vibress-lms/v1/courses` | Publication-resolved, published safe projection, rate-limited |
| Web catalog | `/extensions/vibress-lms/courses` | Locale and SEO aware, no protected content |
| Protected lesson | `/extensions/vibress-lms/learn/...` | Server-authorized member/private cache; fail closed |

Response/error shape must follow Vibress: `{"errors":[{"code":"...","message":"...","requestId":"..."}]}`. Parameter/query/body/response schemas live in publicly consumed versioned contracts; no raw unvalidated JSON or unscoped data repos.

### Example logical operations (not SDK methods)

```text
CourseAdmin.createDraft(scope, validatedInput) -> DraftCourse
Catalog.listPublished(scope, pagination, locale) -> PublicCourseProjection[]
Enrollment.enroll(scope.member, courseId, idempotencyKey) -> Enrollment
Entitlement.canReadLesson(scope.member, lessonId) -> AccessDecision
Progress.completeLesson(scope.member, lessonId, idempotencyKey) -> ProgressSummary
```

Authorization semantics live in the host + LMS domain, not route URL parsing; an enrollment identifier or signed playback token alone must never expose another publication's information.

## 5. Billing and gated access

LMS never directly confirms payment from an untrusted callback. The canonical subscription state resides in Vibress Billing; LMS reads an agreed `hasActiveAccess(member, product, publication)`-style host service, policy reviewed for cancellation/refund/grace. Native one-time purchase is an **unresolved dependency**; do not misrepresent recurring `subscriptions` as per-course one-time purchase. Free enrollments are independently idempotent.

## 6. Course editorial metadata and theme integration

Potential use of a Content Modeler entry to expose **published, non-sensitive catalog data** only. A restricted lesson/quiz cannot be exposed via the public collection endpoint, preview JSON or Liquid context. API contract returns safe localized view models to built-in and external themes. An optional LMS slot must have a standard accessible fallback.

## 7. Conformance and upgrade matrix

For each LMS tag, record `LMS release / host SDK protocol major.minor / supported core versions / migration head / required capabilities`, and test against the lowest and latest supported core patch. Disable activation for unsupported matrix cells with clear operator feedback; never auto-run a new migration against incompatible code.

## 8. Definition of integration readiness

Independent release artifact built and admitted; no core private imports; dual-publication auth/tenant tests; protected media and student data inaccessible from public cache; RTL/SEO theme fallback; migrations and backup/restore verified; disable/upgrade tested; CI contract suite passes. Until then `vibress-lms` is an architecture plan.
