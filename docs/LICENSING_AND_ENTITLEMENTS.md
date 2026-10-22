# Vibress LMS — distinguish Pro licensing from learner course access

**Status: PROPOSED.** Product and legal terms require later approval. No LMS licensing or paid course purchase infrastructure is implemented.

## Two independent decisions

| Scope | Authority | Protected checks |
| --- | --- | --- |
| Learner's paid course access | Verified Vibress Member + course enrollment + canonical core Billing subscription/payment entitlement | Member/publication/course/lesson ownership, refund, expiration, cancellation |
| Operator's license for optional LMS Pro features | Separately approved LMS feature-license issuer and locally verified claims | Operator scope, edition, signed feature claims and expiry; **never** proof of learner purchase |

Do not conflate a valid Pro license with course entitlement, and do not equate core recurring subscriptions with unimplemented **one-time** purchases.

## Pro feature licensing — proposed review requirements

- Licensed claims include product, issuer, edition/features, scope, term, key ID and signature. Verify through an operator-controlled trusted public key; secure local storage with rotation/revocation and audit, no exposure of license secrets or user PII.
- **Offline self-hosted operation** must have explicit, documented verification/outage/grace behavior before Pro is sold. Local verification of signed license is a design option; no compulsory license-service request on every learner lesson request or free LMS operation.
- Enforce Pro capability gates server-side (not only by hiding UI). Expiry/revocation preserves learner content, progress, grades, course records and certificate history; separately define read-only/renewal grace for existing instructor workflows.
- A license outage does not override CMS Staff/Member auth or erase any data. Exports/backups must remain usable according to privacy/retention rules.
- License activation/transfer/seat limitations, telemetry consent, chargeback/refund, support/dispute handling, expired release and downgrade policy all need business/legal approval.

## Paid course access contract

- Host grants server-side entitlement only after validating Member publication equality and canonical Billing state. LMS maps course→product and evaluates enrollment plus access policy for every protected lesson/media grant.
- Handle cancellation, grace, chargeback, refund, expired subscription and out-of-order/replayed webhooks; no client payment-confirmation message grants access. Billing is the source of truth for money, not LMS.
- One-time course purchases are **blocked** until a separately versioned provider-neutral core API/event/reversal contract is approved. No direct provider secrets or unverified checkout callback in LMS.

## Release acceptance

Offline/self-hosted feature license test; signed claims tamper/revocation/expiry; no student data loss on invalid license; free LMS continues; API checks Pro separately from paid learning access; tenant isolation, billing refund/replay, operator docs and support matrix validated.

Related [roadmap](IMPLEMENTATION_ROADMAP.md), [security](SECURITY_OPERATIONS.md), [requirements](PRODUCT_REQUIREMENTS.md).
