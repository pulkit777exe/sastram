# Phase 5 prerequisites — Forking

Phase 5 is the forking differentiator. It is **design-first**: write and get
approval for `docs/FORKING.md` before any schema, API, or UI code. This file is
the visible TODO list from the Phase 1 plan; it intentionally contains no code.

## Gate

- [ ] Write `docs/FORKING.md` covering flows, wireframe-level UI, data model,
      edge cases, and rollout.
- [ ] Get explicit approval of `docs/FORKING.md`.
- [ ] Confirm no paid service or plan upgrade is required (free tiers only until
      Phase 5 is approved; payments remain separately gated).

## Design and data model

- [ ] One unified fork model with a `forkKind` enum:
      `ASSUMPTION` (changed premise), `CONTINUE` (revive stale/outdated),
      `REMIX_AI` (fork an AI answer, edit sources/claims, re-run synthesis),
      `EXTERNAL` (import a user-provided link).
- [ ] Reuse `Thread.forkedFromId` and the existing fork relation rather than a
      parallel lineage table.
- [ ] Define carry-over options: AI summary (default), selected messages, or
      nothing.
- [ ] Define the external-fork payload: title, short excerpt, source link,
      attribution; never mirror full third-party content.
- [ ] Decide supersede representation and whether it needs a new row or only a
      relation/status on the parent and fork.
- [ ] Forward-only, idempotent migration; no edits to applied migrations.

## Access and safety

- [ ] Only users with read access to the parent can fork it.
- [ ] Private forks stay private; visibility never widens implicitly.
- [ ] Rate-limit fork creation and external imports.
- [ ] Reuse `isSafePublicUrl`/SSRF checks for `EXTERNAL` imports.
- [ ] Parent-OP notification on fork; no notification spam for bulk actions.

## UX

- [ ] Lineage breadcrumb (“Forked from X by Y”).
- [ ] Fork count and list on the parent thread.
- [ ] Fork dialog: title, why, carry-over choice.
- [ ] Fork tree view reusing the graph with `forkedFromId` edges.
- [ ] Parent-vs-fork compare reusing the canvas.
- [ ] “Propose supersede” with one-click accept/decline for the parent OP.
- [ ] Mobile-first, keyboard accessible, no layout shift.

## Verification

- [ ] Tests for access control, private forks, rate limits, carry-over,
      notifications, and supersede accept/decline.
- [ ] Typecheck, lint, test, build, `audit:gate`, and e2e for the new UI.
- [ ] Update `shared/ARCHITECTURE.md`, `UBIQUITOUS_LANGUAGE.md`, route lists, and
      `CHANGELOG.md` when the design is implemented.

## Explicitly out of scope for Phase 5 planning

- Payments or plan upgrades (Phase 6, separately gated on explicit approval).
- Scraping Reddit/X/LinkedIn/Quora; only user-provided external URLs are allowed.
