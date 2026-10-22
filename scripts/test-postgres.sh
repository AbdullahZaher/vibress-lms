#!/usr/bin/env bash
# Destructive *test fixture* runner. Never run against a real Vibress database.
set -euo pipefail
: "${LMS_TEST_DATABASE_URL:?Set LMS_TEST_DATABASE_URL to a disposable database named vibress_lms_test}"

command -v psql >/dev/null || { echo "psql is required for test:db" >&2; exit 1; }
db_name="$(node -e 'const u=new URL(process.env.LMS_TEST_DATABASE_URL);if(!["postgres:","postgresql:"].includes(u.protocol))process.exit(2);process.stdout.write(decodeURIComponent(u.pathname.slice(1)))')"
if [[ "$db_name" != "vibress_lms_test" ]]; then
  echo "Refusing to run SQL fixture against a database other than vibress_lms_test" >&2
  exit 1
fi
psql_opts=(-X -v ON_ERROR_STOP=1 --dbname "$LMS_TEST_DATABASE_URL")
if [[ "$(psql "${psql_opts[@]}" -Atc 'select current_database()')" != "vibress_lms_test" ]]; then
  echo "Connected database mismatch; refusing fixture" >&2
  exit 1
fi
# Explicit guard: never reset pre-existing publication data or an installed schema.
existing="$(psql "${psql_opts[@]}" -Atc "select to_regclass('public.publications') is not null or to_regnamespace('vibress_lms') is not null")"
if [[ "$existing" != "f" ]]; then
  echo "Fixture requires an empty disposable database" >&2
  exit 1
fi
psql "${psql_opts[@]}" --single-transaction -f test/sql/core-fixture.sql
psql "${psql_opts[@]}" --single-transaction -f migrations/0001_initial.sql
psql "${psql_opts[@]}" --single-transaction -f test/sql/integrity.sql

# A host migration ledger MUST prevent replay. Directly repeating 0001 fails.
if psql "${psql_opts[@]}" --single-transaction -f migrations/0001_initial.sql >/dev/null 2>&1; then
  echo "ERROR: repeated non-idempotent 0001 unexpectedly succeeded" >&2
  exit 1
fi
kept="$(psql "${psql_opts[@]}" -Atc "select count(*) from vibress_lms.lesson_progress where publication_id='pub-a'")"
if [[ "$kept" != "1" ]]; then
  echo "ERROR: replay attempt changed existing learning progress" >&2
  exit 1
fi
echo "PostgreSQL migration integrity: PASS (fresh, populated, tenant/course/unique checks, replay rollback)"
