# Forking design (Phase 5, design-first)

**Status:** Implemented. This document is the approved design record; the
schema, API, and UI shipped in the Phase 5 implementation (see `CHANGELOG.md`).
**Design branch:** `phase-5-forking-design`.
**Gate:** Payments/plan upgrades remain separately gated (not part of this design).

## 1. Goals and non-goals

### Goals
- Make forking a first-class way to challenge, continue, remix, or externally seed a discussion while preserving lineage and attribution.
- Reuse existing thread primitives (`Thread`, `Thread.forkedFromId`, current fork actions/routes/UI, graph/canvas surfaces) with the smallest additive change.
- Keep the model unified across internal and external forks via a single `forkKind`.
- Preserve access control, privacy, and safety guarantees from Phases 1–4 (visibility never widens implicitly; fetched/imported content treated as untrusted; no scraping).

### Non-goals (Phase 5 planning/implementation scope)
- Payments, subscriptions, or plan upgrades (Phase 6, explicit approval + `docs/PAYMENTS-PLAN.md` required).
- Scraping Reddit/X/LinkedIn/Quora or mirroring third-party content; **only user-provided external URLs** are allowed for `EXTERNAL`.
- A separate lineage table/service, background AI re-synthesis infrastructure beyond existing free-tier AI paths, or new paid dependencies.
- Bulk fork operations/notifications.

## 2. Existing baseline (as of Phase 4)

- **Schema:** `Thread.forkedFromId` (nullable, self-FK `ThreadFork`, indexed) and `forks[]` relation. No `forkKind`, no carry-over metadata, no supersede state.
- **Domain:** `forkThreadDomain` (internal fork: verifies source, copies title/description/tags only for public sources, blocks public forks of non-public sources, sets `forkedFromId`, creates unique slug) and `createExternalForkDomain` (creates thread with source URL in description/initial message, inline visibility, no tag copy).
- **Actions/API:** `forkThreadAction` (read access required, rate-limited `fork:{userId}`), `POST /api/threads/fork-external` (auth + rate limit + `isSafePublicUrl`/SSRF check, sanitized content). `GET /api/threads/[threadId]/fork` exists in UI usage for fork count/list context.
- **UI:** `ForkButton` (title + PUBLIC/PRIVATE visibility, shows fork count) and `ForkFromUrlButton` (URL/title/visibility) in thread surfaces; public pages prompt sign-in to verify/fork/ask.
- **Reuse surfaces available:** graph/canvas components and thread relations (`ThreadRelation`, `forkedFromId` edges can be represented) for tree/compare views.

Design principle: **extend, do not replace** these paths.

## 3. Unified data model

### 3.1 `forkKind` enum (single model)
Add `Thread.forkKind` (nullable for legacy/non-fork rows, or defaultless null) with values:

| Kind | Meaning | Typical source | Carry-over default |
|---|---|---|---|
| `ASSUMPTION` | Fork with a changed premise/assumption to test an alternative framing | Internal thread/answer | AI summary (or selected context) + premise note |
| `CONTINUE` | Revive or extend a stale/outdated/unresolved discussion | Internal thread (often outdated/unresolved) | AI summary + selected messages (opt-in) |
| `REMIX_AI` | Fork an AI answer/synthesis to edit sources/claims and (optionally) re-run synthesis via existing AI flow | AI answer/synthesis context (thread or search result handoff) | AI summary + cited claims/sources snapshot (text refs/links) |
| `EXTERNAL` | Import a user-provided link as a new discussion seed | External URL (user-pasted) | External payload excerpt + attribution only |

- `forkKind` is set at fork creation and immutable thereafter (KISS; changing intent is a new fork).
- A “plain” internal fork in current UX maps to `CONTINUE` by default unless the user explicitly selects `ASSUMPTION`/`REMIX_AI` (migration/defaulting strategy below).

### 3.2 Lineage (reuse, no parallel table)
- **Reuse `Thread.forkedFromId`** as the canonical parent pointer for all fork kinds, including `EXTERNAL` when forking from an in-app context that references a source thread; for pure external URL seeds with no in-app parent, `forkedFromId` remains `null` and lineage is represented by source attribution fields (below).
- **No parallel lineage table.** Lists/trees/counts derive from `forkedFromId` (+ `forkKind`) queries/graph edges.
- `forks[]` relation remains the inverse.

### 3.3 Carry-over options
User chooses at creation time (`carryOver`), persisted as explicit fork metadata (minimal columns/json as decided in implementation; design intent):
- `SUMMARY` (default): copy/snapshot the parent’s `aiSummary` (or current synthesis text for AI-answer context) as starting context. Mark as AI-estimated/carry-over, not canonical truth.
- `SELECTED_MESSAGES`: copy a bounded, user-selected set of message IDs/content snippets (public-safe, size-limited, e.g. up to N messages / total chars cap) into the fork’s initial context/description block; **never** bypass read access checks when selecting.
- `NONE`: create empty fork shell with title/why/attribution only.

Rules:
- Carry-over is a **snapshot at fork time** (not live-synced) to keep behavior simple and auditable.
- Only content the forking user can read may be carried over; private/restricted content is never copied into a more-visible fork (and generally not copied except within allowed visibility—see access rules).
- Carry-over storage must be bounded (char/message caps) to control cost/storage on free tiers.

### 3.4 External-fork payload (`EXTERNAL`)
Store/import only:
- `title` (user-provided or derived, sanitized)
- `short excerpt` (user-provided or fetched preview snippet, strictly length-limited, sanitized; treated as untrusted)
- `source link` (canonicalized URL, validated)
- `attribution` (domain/source label, publish/author metadata only if safely available from user input or safe preview; no impersonation)

**Never mirror full third-party content.** If a fetch/preview is used, it must go through existing safe/public URL + SSRF protections, be size/time-bounded, and be stored only as a short excerpt/preview—not the full page/body. Preferred KISS path: rely on user-pasted title/excerpt/link (+ existing link-preview metadata where already safe) rather than deep crawling.

### 3.5 Supersede representation
**Decision (KISS, no new row/table):** represent “propose supersede” as fork/lineage state on the relationship, not a separate entity.
- Add lightweight state on the fork (or a minimal relation field) such as `supersedeStatus: NONE | PROPOSED | ACCEPTED | DECLINED` with proposer/decider timestamps/actor refs as needed (exact columns finalized in migration design, additive/nullable/default-safe).
- **Semantics:** a fork may propose to supersede its parent. Only the **parent OP** (and moderators/admins per existing moderation authority, if desired—default: parent OP) can accept/decline. Acceptance marks the proposal accepted and surfaces the fork as the preferred continuation; it **does not delete or auto-merge** the parent. Decline records the decision and keeps lineage intact.
- **Why not a new row:** single pending proposal per fork is sufficient for Phase 5; avoids workflow-table complexity. If multi-round proposals are needed later, evolve via forward-only migration.

### 3.6 Migration approach
- **Forward-only, idempotent** migration(s): add `forkKind` enum/column (nullable/backfilled conservatively), carry-over/supersede metadata fields with safe defaults/nullability, and any supporting indexes (e.g. `(forkedFromId, forkKind)` / status) as needed.
- **No edits to applied migrations.** Backfill: existing rows with `forkedFromId` set → `forkKind = CONTINUE` (or `EXTERNAL` heuristically where clearly external-seeded, if reliably detectable; otherwise default `CONTINUE` and leave metadata null) — exact backfill rule documented in implementation PR.
- Keep compatibility with existing reads/writes; nullable/additive fields only.

## 4. Access, privacy, and safety

- **Read access to fork:** only users who can read the parent (`requireReadOrThrow` / visibility policy) may fork it. No forking of threads the user cannot access.
- **Visibility never widens implicitly:** fork visibility defaults to source visibility constraints.
  - Public source → fork may be `PUBLIC`/`PRIVATE`/`RESTRICTED` per user choice (subject to existing rules).
  - Non-public/restricted/private source → fork **cannot** become public; enforce server-side (existing invariant, extend to all kinds/carry-over). Private forks stay private.
- **Carry-over leakage prevention:** do not copy descriptions/tags/messages/summary content in ways that expose non-public parent data to wider audiences; re-check visibility at write time.
- **Rate limiting:** reuse/extend existing limits for fork creation (`fork:*`) and external imports (`fork-external:*` / API scope), per-user and bounded to prevent abuse on free tiers. No bulk fork actions.
- **SSRF / external safety:** `EXTERNAL` imports must reuse `isSafePublicUrl` and existing safe-fetch/SSRF protections; only `http/https` public URLs. Treat fetched previews/excerpts and all external text as hostile (sanitize, length-bound, never interpret as instructions).
- **Notifications:** notify the parent OP on fork creation (single notification per fork event, deduped per fork). **No notification spam for bulk actions** (bulk not supported); apply same restraint to future batched flows.
- **Moderation/content safety:** sanitize all user-provided fields (title, why/premise, excerpt, attribution notes) and run existing moderation/content-safety checks consistent with thread creation.
- **Quota/cost:** `REMIX_AI` re-synthesis (if triggered) must go through existing AI guard/quota/spend-cap paths and free-tier limits; degrade gracefully if unavailable.

## 5. User flows

### 5.1 ASSUMPTION (changed premise)
1. User with read access opens Fork dialog → selects **Change assumption**.
2. Enters new title, “why/premise” (required, short), carry-over choice (default `SUMMARY`), visibility (constrained).
3. System creates fork with `forkKind=ASSUMPTION`, links `forkedFromId`, snapshots carry-over, stores premise note.
4. Parent OP notified once; lineage UI updates.

### 5.2 CONTINUE (revive stale/outdated)
1. Entry points: thread actions and/or “Continue discussion” affordance on outdated/unresolved threads.
2. Dialog preselects **Continue**; user provides title/intent, carry-over (`SUMMARY` or `SELECTED_MESSAGES`), visibility.
3. Create fork with `forkKind=CONTINUE`, preserving lineage; optional note references staleness/outdated context (informational).

### 5.3 REMIX_AI (fork AI answer, edit sources/claims, re-run synthesis)
1. Entry from an AI synthesis/answer surface (search result or thread AI answer card) with source/claim context available.
2. User selects **Remix AI answer**, edits claim emphasis/source selection/notes (bounded), chooses carry-over (default summary + cited refs snapshot).
3. Create fork with `forkKind=REMIX_AI` capturing edited inputs as starting context. **Re-run synthesis** is an explicit user action using existing AI pipeline/quotas (not automatic on create) and produces a new synthesis in the fork; if quota/keys unavailable, fork still created with remixed notes and clear status.
4. Citations/claim-source mapping remain grounded; no invented sources.

### 5.4 EXTERNAL (import user-provided link)
1. User opens “Fork from URL”, pastes `http/https` public URL (+ optional title/excerpt/why).
2. System validates via `isSafePublicUrl`/SSRF checks, derives/sanitizes metadata, builds payload {title, short excerpt, source link, attribution} without mirroring full content.
3. Create thread/fork record with `forkKind=EXTERNAL` (linked to parent context if initiated from one; else standalone seed with attribution). Optional existing @sai summary flow may generate a summary **only** from allowed excerpt/metadata within quotas (not full scraped page).
4. Rate-limited; failures surfaced clearly (invalid/unsafe URL, quota, etc.).

### 5.5 Propose supersede (parent-vs-fork resolution)
1. Fork author (with access) proposes supersede from fork context with a short rationale.
2. Parent OP sees accept/decline controls (and notification). Moderators may intervene per policy if specified, but default authority is parent OP.
3. **Accept:** mark `ACCEPTED`, surface fork as preferred continuation in lineage/parent header; parent remains intact.
4. **Decline:** mark `DECLINED`, retain rationale/history minimally; lineage unchanged.
5. One active proposal per fork (new proposal requires resetting/creating a new fork only if product later requires; Phase 5: allow re-propose by updating state with audit-safe timestamps, KISS).

## 6. UX (wireframe-level, mobile-first, accessible)

- **Lineage breadcrumb:** “Forked from {Parent} by {Author}” (kind badge: Assumption/Continue/Remix/External) near thread title/header; links to parent; keyboard-focusable, no layout shift (reserve space/skeleton consistent with header).
- **Fork count & list:** trigger shows count; panel/dialog lists forks (title, kind, author, visibility-safe metadata, created time, supersede status) with pagination/infinite-safe loading; respects viewer access (omit or redact inaccessible private forks as “private fork” metadata only if count disclosure is acceptable, else exclude from viewer list and show accessible count—**decision:** show only forks the viewer can read plus an aggregate “additional private forks” count when applicable, to avoid leaking private existence details beyond minimal necessity; finalize in impl).
- **Fork dialog:** unified dialog with mode/kind selector (or entry-point preselection), fields: title, why/premise (required for assumption/remix/continue where meaningful), carry-over choice (`SUMMARY` default / `SELECTED_MESSAGES` / `NONE`), visibility (constrained), and for `EXTERNAL` the URL + optional excerpt. Inline validation, clear errors, non-blocking submit state.
- **Fork tree view:** reuse graph with `forkedFromId` edges (and kind/status styling) rooted at selected thread; collapsible nodes, accessible labels, works on mobile (pan/zoom or simplified list-tree fallback).
- **Parent-vs-fork compare:** reuse canvas/compare surface to show parent vs selected fork (summary, key messages/claims, source/carry-over diffs as available) with clear provenance labels.
- **Propose supersede UI:** on fork page, “Propose supersede” action (author) → rationale input; on parent, banner/card with fork summary + **Accept/Decline** (OP) one-click actions with confirmation.
- **Accessibility:** all controls reachable by keyboard, visible focus, labeled inputs, announcements for async state (toast/aria-live), contrast compliant, no layout shift on load.

## 7. Edge cases and handling

- **Parent deleted/soft-deleted or inaccessible later:** fork remains (has its own content/snapshot); lineage breadcrumb shows unavailable parent state gracefully without leaking private metadata.
- **Visibility conflict:** reject attempts to widen visibility or carry over non-public content to wider scopes with explicit 403/validation errors.
- **Duplicate/rapid forks:** idempotent UX not required, but rate limits and normal create semantics apply; unique slug generation remains.
- **External URL unreachable/unsafe/oversized preview:** fail validation or skip preview excerpt while allowing creation only if user supplied minimum required safe payload (KISS: require valid safe URL + title/attribution derivation; excerpt optional).
- **REMIX_AI without sources/claims:** allow fork creation with notes; disable/guard re-run synthesis when inputs insufficient, returning honest status.
- **Insufficient AI quota/keys for re-run:** fork persists; synthesis action returns quota/unavailable error per existing AI guard behavior.
- **Selected messages too large/exceed cap:** enforce hard caps, trim/reject with clear message.
- **Supersede races/double action:** server-side state checks (only one terminal decision path honored; idempotent accept/decline responses).
- **Notifications:** exactly one parent-OP notification per fork; no repeats on edits to supersede state except meaningful transitions if needed (default: only creation + supersede decision).

## 8. Rollout plan

1. **Approval (this phase):** finalize and explicitly approve `docs/FORKING.md`. No code before approval.
2. **Implementation PR (post-approval, single phase branch):**
   - Forward-only/idempotent migration (`forkKind`, carry-over/supersede metadata, indexes).
   - Domain/service/action/API updates (unified kinds, access checks, rate limits, carry-over snapshotting, external payload validation/SSRF, supersede propose/decide, notifications).
   - UI updates (dialog modes, breadcrumb/count/list, tree/compare reuse, supersede controls) mobile-first/a11y.
   - Update `shared/ARCHITECTURE.md`, `UBIQUITOUS_LANGUAGE.md`, route lists, and `CHANGELOG.md`.
3. **Verification before merge:** typecheck, lint, test, build, `audit:gate`, and e2e for new UI; targeted tests per section 9.
4. **Feature exposure:** enable in all environments once verified (no paid dependency). Monitor error/rate-limit signals via existing logging/health surfaces.
5. **Backfill/compat:** legacy forks mapped to `CONTINUE` (or best-effort heuristic) without breaking existing links/counts.

## 9. Verification plan (implementation phase)

- **Access control:** cannot fork unreadable parent; non-public parent cannot produce public fork; carry-over cannot leak private content.
- **Privacy/visibility:** private forks remain private across all kinds; list/count respects viewer access.
- **Rate limits:** fork creation and external import throttled per existing/user keys.
- **External safety:** unsafe/private URLs rejected (SSRF), no full-content mirroring, excerpts bounded/sanitized.
- **Carry-over:** `SUMMARY`/`SELECTED_MESSAGES`/`NONE` behave correctly, snapshot semantics, size caps enforced.
- **Notifications:** single parent-OP notification on fork; supersede transitions notify appropriately without spam.
- **Supersede:** propose/accept/decline permissions and state transitions correct and race-safe.
- **UI/e2e:** dialog flows for all kinds, breadcrumb/count/list/tree/compare rendering, keyboard/a11y basics, no layout shift.
- **Gates:** `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, `bun run audit:gate` (+ e2e).

## 10. Resolved decisions and open items

### Resolved (KISS defaults in this design)
- **Lineage:** reuse `Thread.forkedFromId` (+ `forkKind`/metadata), no parallel lineage table.
- **Supersede:** represented as fork state/status (proposed/accepted/declined) with parent-OP decision; no separate table/row entity.
- **External content:** user-provided URL + short excerpt/attribution only; never mirror full third-party content; SSRF-safe.
- **REMIX_AI re-run:** explicit, quota/guarded, uses existing AI pipeline; not automatic.

### Open (confirm during approval/implementation)
- Exact persisted shape for carry-over snapshot and supersede metadata (dedicated nullable columns vs small JSON field) — choose smallest additive schema consistent with query needs.
- Whether moderators/admins (beyond parent OP) can accept/decline supersede by default.
- Fork list privacy detail: show “additional private forks” indicator vs exact private count to viewers without access.
- Heuristic for backfilling legacy external-seeded forks to `EXTERNAL` vs defaulting all legacy to `CONTINUE`.

---
*End of design. Awaiting explicit approval before any Phase 5 implementation code.*