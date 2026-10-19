# Vibress LMS — security threat model and operations

**Status: PROPOSED controls.** A credible external-plugin security boundary does not exist yet for unknown/untrusted JS code; only vetted operator-installed code is admissible in the initial platform release.

## 1. Assets and adversaries

Assets: learner personal data, protected course material, assessment answers, credentials/session cookies, purchase entitlements, certificates, audit trail, publication boundaries and backup secrets.

Threats: anonymous access, learners accessing others' data, malicious course editor, cross-publication Staff/Member context confusion, compromised extension supply chain, forged billing events, replayed progress/quiz submissions, malicious HTML/attachments, SSRF from integrations, video URL sharing and queue duplicate processing.

## 2. Auth and tenancy matrix

| Operation | Minimum actor | Server policy |
| --- | --- | --- |
| List published courses | Visitor / publication | Only published safe projection; no private metadata |
| Create/update course | Staff | Staff session + `lms.course.manage`, origin, publication |
| Enroll in free course | Member | Member session, origin, publication/active course, idempotency |
| Read protected lesson/media | Member | Owned current enrollment, course policy, entitlement and member status |
| Complete lesson | Member | Same checks plus current lesson belongs to owned course, idempotency |
| Edit another instructor's course | Authorized manager only | Per-course assignment + explicit permission; staff role not implicit |
| Read learner reports | Authorized manager | Publication scope, least PII, audit and pagination |
| Install/upgrade package | Operator | Vetted artifact, release admission, audited deployment |
| Purge LMS records | Explicit privileged action | Backup/export, confirmation, separate audit from ordinary uninstall |

- Use authoritative host `publicationId`, not request-provided tenant ID. For Member calls verify `member.publicationId === independently host-resolved publicationId`; `requireMemberSession` alone is insufficient. Section/lesson/enrollment/progress must belong to the same **course** through composite FK **and** domain checks. Every query and unique key includes publication context. A resource ID alone never grants rights.
- Member and Staff are distinct; an email match does not unite sessions. Unauthenticated should fail 401; unauthorized 403 or privacy-preserving 404 according to endpoint policy.
- Session cookies are HttpOnly/Secure/SameSite per host policy, with validated origin/CSRF for mutations. Strong rate limiting on enrollment, quiz attempts and video grants.
- Machine-to-machine service and webhooks use scoped signed credentials; never log bearer tokens, signatures or full student payloads.

## 3. Learning-specific protections

### Paid courses

Never treat public course metadata, enrollment status or a client-reported payment as billing authorization. The LMS may use a core-mediated subscription entitlement read after canonical reconciliation. Cancellations/refunds/grace windows explicitly modeled. Disable purchase UI until one-time purchases have a reviewed supported bridge. Fail closed when access cannot be proven.

### Protected media and exam material

Private storage, no public CDN master URL in HTML/metadata/logs; grant short-lived signed URLs after server authorization and limit allowable paths and MIME. Signed URLs reduce casual exposure but are **not DRM**; use streaming provider controls if stronger protection is required. Questions/correct answers kept server-side until policy permits review; no leaked answer keys through SSR hydration or browser source maps.

### Rendering and plugin trust

Sanitize rich HTML and localized content; forbid arbitrary scripts in lesson documents and Liquid variables. Review media uploads (size/MIME/content), CSP, iframe sandbox/origin, safe redirects, user-generated URLs and CSS isolation. SDK-only imports do not sandbox trusted JS; no uploaded untrusted plugins from browser.

## 4. Failure and operational policy

| Event | Behavior |
| --- | --- |
| LMS process/handler fault | Core continues; API returns stable error with request ID |
| Plugin disabled | Reject new LMS routes/jobs; retain state, allow safe re-enable |
| Migration interruption | Remain disabled/migration_required; retry verified idempotent step |
| Billing provider outage | Deny new uncertain paid entitlements; preserve auditable known history |
| Duplicate enrollment webhook | Unique idempotent course/member registration, no double charge |
| Worker retry after crash | Stable job key and database commit markers prevent duplicate certificates/emails |
| Wrong publication or member | No data; privacy-safe 404 |
| Lost private media secret | Rotate/revoke grants, limit exposure, incident audit |
| Course deletion attempt | Soft/archive by default if learners exist, protect references |

## 5. Deployment and recovery

- Image-based, operator-approved trusted package: compute SHA-256 over final immutable archive bytes and verify against an **external trusted release lockfile or detached signed envelope**, never self-claimed internal archive checksum. Docker volumes for private storage, PostgreSQL/Redis configured by Vibress operator. No mandatory external LMS SaaS.
- Startup: preflight artifacts, compare host API compatibility, scan migration head, check reserved route collisions, refuse unsafe enablement.
- Migration: staging clone with production-like data, snapshot/backup, lock budget, additive change, canary publication.
- Rollback: only previous binary if schema remains backward compatible. Otherwise forward-fix or restore verified backup of LMS + core state together; reconcile durable events.
- Include LMS tables/files/secrets in backup. Test restore on fresh instance; do not claim an automated down migration is safe.
- Audit package install, activation, course publish, enrollment override, manual grading, certificate revocation and data purge.
- Observability: request/trace ID, publication scope (internal), latency/error code, queue depth and migration state. Anonymize learner identities in metrics.

## 6. Licensing, locale and route privacy risks

LMS Pro feature licensing is distinct from learners' course payment entitlements. A Pro license does not grant course access or bypass Staff/Member permissions; expired/invalid Pro claims never erase courses, grades or progress. Offline/self-hosted operation and outage/grace need explicit policy before commercialization. See [license and entitlement RFC](LICENSING_AND_ENTITLEMENTS.md).

Locale variants share canonical IDs, preserving progress. Translated slugs or fallback cannot expose unpublished/private lessons, answer keys or wrong-publication content. Extension route prefixes need explicit site privacy controls: the existing public-content privacy hook is not automatically applied to new routes. Protected learner SSR and caches default to private/no-store.

## 7. Mandatory security suite

- Anonymous and missing origin tests; forged staff/member cookies; student can't impersonate another; reviewer cannot edit course.
- Read/write wrong-publication all routes, jobs, migrations, media tokens; private content absent from public catalog/search/cache.
- Race tests for enrollment, lesson completion and quiz submission; duplicate/out-of-order events.
- Stored XSS via titles/translations, file/path traversal, unsafe redirects, SSRF, CSP/clickjacking.
- Tampered final archive/invalid detached digest, unsigned code attempt, unknown capability, both plugin SDK ABI shapes/mismatches, named event dispatch and deactivation cleanup.
- Upgrade mid-flight, backup/restore with legacy records, disabled state with active queue.
- Arabic RTL + keyboard, captions and accessible error/status announcements.

Final security sign-off belongs to Vibress host and LMS release reviewers together. See [integration](INTEGRATION_CONTRACTS.md) and [release gates](TEST_RELEASE.md).
