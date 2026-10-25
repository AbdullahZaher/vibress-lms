# LMS NUI-05 — Read-Only Native Course Overview Pilot

**Status:** Source-only pilot on `docs/native-admin-ui-plan-20261025`. **Not released, deployed, signed, or production-approved.**

## Scope and non-goals

The operator-trusted LMS authoring extension now declares a second, Host-owned `course-overview` Admin view. It reuses the current, permission-checked Admin `courses` GET route, renders a bounded scalar snapshot, and optionally uses NUI-03 typed Host storage resources for an actual paginated, read-only table. The original `courses` Admin view and opaque-origin iframe retain **all existing course editing and publishing operations**.

The Native overview is deliberately read-only. **No `adminActions` declaration exists in this LMS artifact.** The generic NUI-03 storage create/update route must not edit or publish LMS courses: it does not enforce LMS-specific bilingual completeness, saved-version identity, draft-only modification, publication immutability, or other course lifecycle invariants.

This is a safe first migration of a **view**, not a claim of course-authoring feature parity, LMS-MVP completion, or general Native action framework certification.

## Operator prerequisites

1. Deploy a compatible Vibress Host with the admitted NUI-01/NUI-02 and NUI-03 resource protocols. Older Hosts must continue rendering only the supported legacy view, subject to their own admission rules.
2. Review the operator-approved `courses` model and the projected fields `title_en`, `title_ar`, and `status`. No new LMS database migration is needed for this view; the Host must verify the existing model and publication binding.
3. Independently build/test the LMS artifact (`npm run verify:local` and `npm run release:authoring`, or the repository's currently supported equivalent), review the resulting unsigned lockfile, and approve/sign an immutable operator release before installation.
4. Only after independent security/operations sign-off, consider enabling `VIBRESS_NATIVE_ADMIN_UI_RELEASES=manifestId@entrypointSha256` for that **exact approved artifact**. Keep `VIBRESS_NATIVE_ADMIN_ACTION_RELEASES` **unset**.
5. Test current and previous Host versions, including a fresh installation and upgrade, before enabling the Native overview for any live publication. Do not copy a stale artifact digest from source control or a previous build.

## Acceptance checklist

| Requirement | Evidence required |
| --- | --- |
| Read-only Native overview | Owner/admin can view only explicitly projected course fields; no mutation control in overview |
| Legacy authoring parity | All existing create/save/publish, bilingual and draft/immutable checks still work in `courses` iframe |
| Publication isolation | A Staff session in publication B cannot read publication A's course records; switching publications clears cached rows |
| Content safety | HTML-like titles stay escaped text in both Native tables and the old iframe's repaired DOM |
| i18n/RTL/a11y | Arabic labels, RTL layout, mixed-direction title text, keyboard navigation and focus states verified in browser |
| Upgrade safety | Old Host with legacy-registered view, new Host with old plugin, signed artifact changes and rollback examined |
| Security/revocation | Revoked release, disabled publication, changed permission, invalid cursor, and unsigned/unknown models fail closed |
| Production and recovery | Real PostgreSQL, multi-replica API cursor behavior and recovery/rollback rehearsal observed |
| Compliance | CI green, independent Security/API/Operator approval, no unsafe plugin-code injection into Admin origin |

## Follow-up before full LMS Native authoring

A versioned, domain-specific action API must delegate course create/save/publish to the LMS application service, preserving all rules enforced by the current `POST courses` handler. New forms and confirmation UX must then pass adversarial tests for IDOR, cross-publication access, stale versions, multiple locales, immutable published courses, invalid content, write revocation, retries, and duplicate requests. The generic Host storage CRUD action set cannot substitute for domain-specific authorization.

Do not remove the legacy UI asset, change durable course formats, update the operator allowlist, or advertise Native course authoring as complete under this pilot.
