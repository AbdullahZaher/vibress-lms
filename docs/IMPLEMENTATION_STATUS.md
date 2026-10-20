# Vibress LMS — executable domain foundation (2026-10-20)

**Status: DEVELOPMENT ONLY. NOT A HOST-INSTALLED PLUGIN.** This repository contains a genuine, tested pure LMS domain foundation. No persistent data is written.

## Host review snapshot (verified 2026-10-20)

- Vibress core `main` currently exposes `@vibress/plugin-sdk` protocol `1.0.0`, lifecycle hooks, and operator-trusted plugin activation. The SDK protocol version is not the same as its npm package version.
- [Core PR #62](https://github.com/AbdullahZaher/vibress/pull/62) is open and not merged at inspection time. It adds optional host-mediated Admin/Member/Public API route descriptors and host-resolved principal/publication, but does **not** implement EXT-203 plugin-owned scoped repositories or migrations.
- Current EXT-201 route responses are scalar-shape descriptors; a real paginated course catalog or nested curriculum needs a reviewed versioned data envelope or an explicitly supported, bounded representation. Do not stringify arbitrary JSON into scalar fields to evade runtime validation.
- EXT-203/204 scoped persistence and Member/entitlement bridges, EXT-301/302 Admin/Web view registration, and worker/artifact contracts remain blockers to a shippable LMS.

## Scope implemented here

- Canonical, locale-neutral course/lesson/enrollment/completion TypeScript domain types.
- Published-locale-only public metadata projection, with no private lesson refs exposed.
- Free-course protected lesson access decision requiring matching publication, course, active enrollment, Member ID, and published course/lesson locale; paid access fails closed.
- Deterministic required-lesson progress and duplicate-completion admission logic, including cross-course integrity failures and no automatic completion of empty curricula.
- Node built-in unit tests covering successful and denied scenarios for Arabic/English content.

## Guardrails / explicit non-features

These functions **do not authenticate callers**; `VerifiedMemberScope` is only a type indicating expected **host-verified input**. An API handler must obtain Member and publication from independent authoritative host resolvers, check equality, validate external input at runtime, and enforce origin/CSRF policy. Never trust client-provided IDs, `isPaid`, or self-asserted roles. Raw private media references returned to authorized server logic are **not download grants**.

`decideLessonCompletion` does not write progress. A future host-mediated transaction and UNIQUE(publication_id,course_id,enrollment_id,lesson_id) constraint must enforce concurrency safety and idempotency. `calculateCourseProgress` describes the current published required curriculum revision, not a durable completion certificate. No speculative SQL migration, direct core DB access, plugin manifest, routes, feature claims, or fake worker was added.

## Local verification

```bash
npm install
npm run typecheck
npm test
```

The development snapshot was tested locally with global TypeScript 5.8.3 and Node 22.16.0: strict typecheck succeeded and **11 Node tests passed**. This is not proof of CI, host integration, published SDK compatibility, API authorization, PostgreSQL upgrades, Docker, or browser/RTL E2E verification.

## Next gated steps

1. Have core complete/review host typed scoped storage, authoritative Member and entitlement facades, migration ledger, and stable route response validation.
2. Build public-SDK-only install fixture/manifest and exercise actual host admission, activation, per-publication disablement and schema negotiation.
3. Add separately reviewed namespaced course/section/lesson/enrollment/progress migration, same-publication and same-course composite constraints, populated upgrade and restore tests.
4. Implement staff course publishing, member enrollment and secured locale-aware lesson routes, plus Studio/Web UI with RTL, accessibility, SEO and theme fallback.
5. Run full negative-case host integration, race/idempotency, Docker, backward-compatibility, and CI matrix before declaring MVP or Pro readiness.

This branch intentionally avoids changes to Vibress core and does not overlap the ongoing core extension host agent.
