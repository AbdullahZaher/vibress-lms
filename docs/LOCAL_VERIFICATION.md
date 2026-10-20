# Offline / local validation policy

This is the supported **non-CI verification path** while GitHub Actions is unavailable. It does not waive runtime integration and database release gates.

## Run

```bash
# With TypeScript installed from the declared package dependencies:
npm run verify:local

# Independently, only when a disposable PostgreSQL instance is available:
LMS_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vibress_lms_test npm run test:db
```

`verify:local` runs the following, **in order**:

1. `lint`: strict TypeScript compiler analysis (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`) and Node syntax checks for the two current test files.
2. `typecheck`: project strict TypeScript no-emit validation.
3. `test`: compile TypeScript and execute both Node unit-test files.

**Important:** `lint` is a compiler-based static lint check, **not ESLint**. No ESLint package is installed or claimed to have run. The strict checker does not replace an eventual full ESLint/accessibility/security review.

## Verification recorded 2026-10-20

- Locally checked against source/test files with Git object SHA-1 hashes matching the reviewed GitHub branch.
- Node `v22.16.0`, global TypeScript `5.8.3`, npm `10.9.2`.
- `npm run verify:local`: **PASS**; 26/26 tests pass, no type errors or syntax errors.
- `npm install`: **NOT run** (network registry lookup returned EAI_AGAIN).
- `npm run test:db`: **NOT run** (no PostgreSQL server/client locally). Candidate DDL and compound FK constraints remain **unverified by database execution**.
- ESLint, DB upgrade/rollback, host permission and cross-publication integration, Docker and browser/i18n E2E: **NOT run**.
- GitHub Actions job still fails with no runner allocated/zero steps. A failed CI badge is **not overridden** by this note.

## Review checklist before accepting migration 0001

- Run test:db using PostgreSQL 16 in a disposable database; inspect SQLSTATE violations and replay rollback.
- Validate against actual Vibress schema, both new and populated upgrades, and EXT-203 ledger/checksum lock behavior.
- Verify authoritative Member/session publication binding and authorization for every operation; local pure-domain tests are not security integration tests.
- Run restore/recovery, multiple publications/courses, private lesson/paid entitlement denial, Arabic/RTL Web/Studio tests.
- Preserve these source-level tests as fast gates even after CI resumes.

Do not merge or ship candidate migration solely based on `verify:local` success.
