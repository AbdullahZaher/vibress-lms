# EXT-502 — live Vibress Host acceptance (operator-managed)

**Status:** independent acceptance client available; **not evidence that a Host deployment has passed**.
The client makes real HTTP requests to a running Vibress installation. It uses
only the Host's public `/api/content/v1` and Member `/api/members/v1` APIs,
with **no** private package imports, database connection, session creation,
plugin installation, signature bypass or direct tenant selection.

## Prerequisites: controlled non-production installations

1. Build and independently review the trusted single-file LMS Pilot artifact
   using `npm run release:pilot`, then **operator-sign** its exact lockfile.
   Preflight the trusted release on every relevant API replica using Vibress's
   signed operator-release process; do not run unsigned release fixtures in
   production. Do not replace the global operator lockfile with the Pilot-only
   fixture or modify an approved migration ledger from an HTTP endpoint.
2. Use Vibress including migration **0045**. Once the Pilot-only lockfile
   entry has been merged into the full operator lockfile and the **final global
   lockfile has been signed**, run the **read-only** EXT-503 plan validator in
   the Vibress core checkout (**core PR #81**, pending merge):

   ```sh
   export VIBRESS_TRUSTED_PLUGIN_LOCKFILE=/absolute/operator/trusted-plugins.json
   export VIBRESS_TRUSTED_PLUGIN_REQUIRE_SIGNATURE=1
   export VIBRESS_TRUSTED_PLUGIN_PUBLIC_KEY_FILE=/absolute/operator/operator-public.pem
   export VIBRESS_TRUSTED_PLUGIN_SIGNATURE_FILE=/absolute/operator/operator.sig
   pnpm exec tsx scripts/plugins/check-migration-plan.ts \\
     /absolute/operator/operator-migration-plan.json
   ```

   This check verifies exact release/model compatibility **without applying
   any migration**. Apply the operator-approved physical model catalog for the
   Pilot's two models using the separate privileged migration service while
   the plugin is inactive; never treat a dry-run success as DB admission.
   Do not apply standalone LMS `0001_initial.sql` to the Host.
3. Register and activate `vibress-lms-pilot`, and enable it **independently**
   on two test publications with distinct externally routed site origins.
   Configure both publications to publish the pilot's `en` and `ar` locale
   variants. Ensure site privacy and `Origin` settings permit test traffic.
4. Prepare **three fresh Member sessions**: A1 and A2 belong to publication A;
   B1 belongs to publication B. None should have a Pilot enrollment. Export
   the exact `Cookie` HTTP header values only as environment variables in a
   restricted shell. Never put cookies in CLI arguments, files, logs, issues,
   PR descriptions, screenshots, or persisted test fixtures.
5. Run the read-only probe first, against two different origins. The probe
   verifies both localized public views, unauthenticated rejection,
   publication/session mismatch rejection and lack of prior enrollment.

```sh
export LMS_HOST_SITE_A='http://site-a.localhost:7777'
export LMS_HOST_SITE_B='http://site-b.localhost:7777'
export LMS_HOST_COOKIE_A1='member-session-cookie-name=redacted-session-1'
export LMS_HOST_COOKIE_A2='member-session-cookie-name=redacted-session-2'
export LMS_HOST_COOKIE_B1='member-session-cookie-name=redacted-session-3'
npm run host:acceptance
```

Once the read-only probe succeeds against **disposable test Members**, opt in
explicitly to mutating acceptance. It enrolls A1, completes exactly the
`welcome` lesson, verifies a retry is idempotent, checks 50% progress, tests
wrong-Origin POST rejection, and confirms A2/B1 remain unenrolled.

```sh
LMS_HOST_ALLOW_WRITES=1 npm run host:acceptance
```

The second run cannot use the same A1 account after the first successful
mutation; create new test Members for any repeat run. With remote staging,
**both** sites must be HTTPS and the operator must explicitly enable:

```sh
LMS_HOST_ALLOW_REMOTE_STAGING=1 npm run host:acceptance
```

Remote acceptance defaults to **read-only** until the separate
`LMS_HOST_ALLOW_WRITES=1` opt-in is provided. Do **not** use production Members,
production domains, customer data or a public staging host containing live
accounts. The script rejects insecure remote HTTP origins and credentialed
URLs. Redirects are forbidden to prevent carrying a Member cookie to a
redirect target. A denied request must be a real 401/403/404 (never 5xx).

## Local deterministic verification (no Host required)

```sh
node --test test/live-host-acceptance.test.mjs
npm run verify:local
```

The first command tests the acceptance **client** against disposable loopback
HTTP fixtures: configuration fail-closed, separate Member/publication binding,
Origin enforcement and idempotent enrollment/progress. It is deliberately NOT
proof that a real Fastify Host, signed artifact, PostgreSQL or Docker passed.

## Release and operations gates still required

- Execute this client successfully against the real operator-admitted Pilot
  bundle, on two publications, with positive and negative Host authentication.
- Independently exercise same Member revocation/disablement, extension
  deactivation, physical-schema digest mismatch and rollback, concurrent
  inserts on PostgreSQL and backup/restore. Verify `audit_events` and no PII.
- Review signature/lockfile and route response schema parity with the exact
  Vibress core revision. Validate Docker replicas, TLS proxy, private sites,
  accessibility, Arabic/RTL and locale fallback behavior.
- This Pilot is only an immutable free-course fixture, not dynamic LMS
  publishing, secure course payments, videos or a commercial-ready plugin.
- **Temporary CI pause:** `.github/workflows/lms-foundation.yml` has manual
  `workflow_dispatch` only. Run the unchanged full suite before approval and
  restore automatic PR/push checks when runner provisioning is available.
