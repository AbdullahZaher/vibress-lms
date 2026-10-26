# LMS NUI-05 — Native Course Authoring Pilot (Experimental)

**Status:** Source-only pilot on `docs/native-admin-ui-plan-20261025`. **Not released, deployed, signed, or production-approved.**

## Scope and non-goals

The operator-trusted LMS authoring extension now declares a second, Host-owned `course-overview` Admin view. It reuses the current, permission-checked Admin `courses` GET route, renders a bounded scalar snapshot, and optionally uses NUI-03 typed Host storage resources for an actual paginated, read-only table. The original `courses` Admin view and opaque-origin iframe retain **all existing course editing and publishing operations**.

The source now declares an **optional paired native domain workflow** for create/save/publish, which is shown only for independently approved Native read and write releases. **No generic `adminActions` declaration exists in this artifact.** The generic NUI-03 storage create/update route still must not edit or publish LMS courses: it does not enforce LMS-specific bilingual completeness, saved-version identity, draft-only modification, publication immutability, or other course lifecycle invariants.

This is a source-level Native view plus domain-workflow pilot, not evidence of real database/browser course-authoring parity, LMS-MVP completion, or general Native action framework certification.

## Operator prerequisites

1. Deploy a compatible Vibress Host with the admitted NUI-01/NUI-02 and NUI-03 resource protocols. Older Hosts must continue rendering only the supported legacy view, subject to their own admission rules.
2. Review the operator-approved `courses` model and the projected fields `title_en`, `title_ar`, and `status`. No new LMS database migration is needed for this view; the Host must verify the existing model and publication binding.
3. Independently build/test the LMS artifact (`npm run verify:local` and `npm run release:authoring`, or the repository's currently supported equivalent), review the resulting unsigned lockfile, and approve/sign an immutable operator release before installation.
4. Only after independent security/operations sign-off, consider enabling `VIBRESS_NATIVE_ADMIN_UI_RELEASES=manifestId@entrypointSha256` for that **exact approved artifact**. Keep `VIBRESS_NATIVE_ADMIN_ACTION_RELEASES` **unset**.
5. Test current and previous Host versions, including a fresh installation and upgrade, before enabling the Native overview for any live publication. Do not copy a stale artifact digest from source control or a previous build.

## Audience-scoped storage admission

The authoring release fixture explicitly pins `publicReadModels` and
`memberReadModels` to `["courses"]`. Only published records are projected
by public routes, and authenticated Member access still checks the published
course and enrollment state. Member-owned enrollment/completion records use
the separate `memberStorage` API and must never enter generic Public/Member
storage. Existing unsigned fixture artifacts must be regenerated and reviewed;
this change does not install, sign, or authorize an updated release.

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

## Follow-up before production LMS Native authoring

The experimental bounded form now calls the existing LMS `POST courses` handler, preserving its application validation and storage CAS behavior; no generic CRUD publish shortcut is added. The remaining release gate is real, independent parity testing for IDOR, cross-publication access, stale revisions, multiple locales, immutable published courses, invalid content, write revocation, retries, duplicate requests, upgrade/rollback, and operator artifact signing. A source-level form is not proof that these scenarios passed.

Do not remove the legacy UI asset, change durable course formats, update the operator allowlist, or advertise Native course authoring as complete under this pilot.

## Native course authoring — experimental domain-workflow pilot

The independent LMS package now declares `adminDomainWorkflows` for the
`course-overview` page. The descriptor supplies bounded bilingual field labels
and `create`, `save`, and `publish` operation values. It contains no URL,
JavaScript callback, SQL, new route, or authorization grant.

A compatible Host renders a native course editor only after independently
approving the same immutable plugin digest in **both**
`VIBRESS_NATIVE_ADMIN_UI_RELEASES` and
`VIBRESS_NATIVE_ADMIN_ACTION_RELEASES`, verifying the publication-local
`plugins.manage` permission, and binding a matching existing Admin GET/POST
route to the view. No flags are enabled by this source change.

Each native form submission uses the already permission-checked
`POST /api/admin/v1/extensions/:pluginId/v1/courses` route. The plugin's
existing course service enforces draft-only changes, exact saved revision
checks, bilingual publish completeness and published-record immutability.
The Host's generic NUI-03 storage mutation gateway is intentionally *not*
exposed by the LMS package. This remains an unsigned, non-deployed
review fixture; it is not production acceptance.

The Native table reads up to five full bilingual course records per page
from the pinned, publication-scoped Host model. It displays the three
overview columns and uses the remaining projected fields in the editor.
This interim pagination cap reduces response size; a dedicated
field-projected detail endpoint can improve efficiency in a later version.

Release gates still require a real PostgreSQL two-publication end-to-end
integration, keyboard/Arabic RTL browser verification, operator-approved
release build/signature, old-Host/upgrade tests, mixed-replica deployment,
rollback, and independent Security/API/Operations acceptance. The original
`courses` iframe is kept unchanged for operator-approved fallback.
