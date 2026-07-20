# Backlog — post engagement (Phases 1–4)

Vertical slices left over from the security / doc-hygiene / `@sai` cost-gating
engagement. Slices are tracer bullets: each cuts end-to-end and is independently
grabbable. HITL = needs a human decision; AFK = implementable and mergeable
without human interaction.

> Founder-level decisions (slices 6–7) are intentionally NOT engineering tickets.
> They are brought to the owner directly via `plan-ceo-review` framing.

## Triage (state machine, applied 2026-07-18)

Canonical roles: category `bug | enhancement`; state
`needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix`.

| Slice | Category | State | Why |
|---|---|---|---|
| 1 Cost classifier → all gates | enhancement | ready-for-agent | fully specified, tests defined, AFK-grabbable |
| 2 Spend telemetry dashboard | enhancement | ready-for-agent | clear acceptance criteria, AFK |
| 3 Moderation/image spend-cap gap | enhancement | ready-for-agent | bounded fix, fail-open required, AFK |
| 4 Thread-create/cron enqueue gates | enhancement | ready-for-agent | code paths identified, AFK |
| 5 Daily-digest/query-warming cap | enhancement | ready-for-agent | code paths identified, AFK |
| 6 Monetization / cap ceiling | decision | ready-for-human | founder-level, not engineering |
| 7 Cold-start population | decision | ready-for-human | founder-level, not engineering |
| 8 `prisma.poll.findUnique({ where: { threadId } })` typecheck error | bug | ready-for-agent | pre-existing, unrelated to current work, breaks `pnpm typecheck`; AFK |
| 9 `thread-components.test.tsx:318` pinned-message render test fails | bug | ready-for-agent | pre-existing, unrelated; fails on fresh checkout; AFK |

None are `bug` (no regression found in Phase 4). None `wontfix`. No `needs-info`
(open questions would block an agent — none exist). New contributors: pick any
slice 1–5; slices 6–7 are owned by the founder.

## Slice 1 — Wire cost classifier into all AI gates
- **Type:** AFK
- **Blocked by:** None
- **What to build:** `evaluateAiCostGate` (lib/services/ai-cost-classification.ts)
  currently only gates the `@sai` inline enqueue path. Extend the pre-flight to
  the other expensive paths: forum-search synthesize (app/api/ai/forum-search),
  thread-summary enqueue, and ai-reply-stream route. Each should call
  `evaluateAiCostGate` with its `AiCallPath` before firing/spending.
- **Acceptance criteria:**
  - [ ] forum-search synthesize path blocks when `evaluateAiCostGate` returns `allowed:false`
  - [ ] thread-summary enqueue pre-flights the gate
  - [ ] ai-reply-stream route pre-flights the gate
  - [ ] unit tests cover each new gated path (cheap allowed, expensive blocked on cap)
  - [ ] `tsc --noEmit`, `eslint .`, `pnpm test` clean

## Slice 2 — Plumb AI spend telemetry to a dashboard
- **Type:** AFK
- **Blocked by:** None
- **What to build:** The `$5/day` cap (lib/services/ai-spend-cap.ts) and per-request
  token logging (lib/services/ai-usage-logger.ts) exist but are not surfaced.
  Expose `getAiSpendUsage()` via an admin endpoint and publish per-user estimates
  from measured token counts, replacing the static `ESTIMATED_COST_USD` table in
  ai-cost-classification.ts.
- **Acceptance criteria:**
  - [ ] admin endpoint returns current spend vs cap
  - [ ] `@sai` cost estimate switches from static table to measured tokens where available
  - [ ] [docs/AI-COST-ESTIMATE.md](./AI-COST-ESTIMATE.md) updated with measured numbers

## Slice 3 — Close moderation / image spend-cap gap
- **Type:** AFK
- **Blocked by:** None
- **What to build:** Text toxicity moderation (lib/services/moderation.ts) and image
  moderation (consumeImageModerationQuota path) currently bypass the global `$5/day`
  spend cap entirely. Add a pre-flight `checkAiSpendCap` for these paths so a
  runaway moderation bill is bounded. Keep fail-open behaviour (moderation must
  never block a post on Redis-outage).
- **Acceptance criteria:**
  - [ ] toxicity + image moderation consult spend cap pre-flight
  - [ ] fails open on Redis outage (posting unaffected)
  - [ ] unit tests for the gate

## Slice 4 — Gate thread-create / cron DNA-score-conflict enqueues
- **Type:** AFK
- **Blocked by:** None
- **What to build:** Thread-create (modules/threads/threads-write/repository.ts) and
  cron (app/api/cron/update-threads/route.ts) enqueue DNA/score/conflict jobs that
  are only gated at worker time (assertSpendCapAvailable). Add enqueue-time pre-flight
  so unaffordable work is not enqueued.
- **Acceptance criteria:**
  - [ ] thread-create path pre-flights gate
  - [ ] cron enqueue paths pre-flight gate
  - [ ] no double-counting with worker-level consumeSpendCap

## Slice 5 — Daily-digest cron route + query-warming spend-cap gate
- **Type:** AFK
- **Blocked by:** None
- **What to build:** `GET /api/cron/daily-digest` and the cron query-warming path
  (modules/ai-search/query-warming.ts) have NO spend-cap gate today. Add a pre-flight
  so these server-triggered, multi-call paths respect the global cap.
- **Acceptance criteria:**
  - [ ] daily-digest cron route pre-flights cap
  - [ ] query-warming pre-flights cap (or is explicitly exempted with a documented reason)
  - [ ] cron auth (verifyCronAuth) still enforced

## Slice 6 — FOUNDER DECISION: AI monetization / unit-economics & spend-cap ceiling
- **Type:** HITL
- **Blocked by:** None
- **RESOLVED 2026-07-18 — DECISION: Keep the `$5/day` global cap, no monetization.**
  Zero onboarding friction; owner funds ≤$150/mo. Reversible (5/5). Matches the
  current open-source / not-yet-monetizing posture. Revisit only if active-user
  count grows enough that the cap throttles real usage (then see slice 2 telemetry).
- **Acceptance criteria:** N/A (decision record, not code)

## Slice 7 — FOUNDER DECISION: cold-start population strategy
- **Type:** HITL
- **Blocked by:** None
- **RESOLVED 2026-07-18 — DECISION: Invited alpha cohort first.** Onboard 10–25 known
  users to populate threads before broad public onboarding. Preserves the "real
  strangers" goal without the empty-room first impression. Broad public signups open
  after critical mass is reached.
- **Acceptance criteria:** N/A (decision record, not code)

---

## Slice 8 — Fix `prisma.poll.findUnique({ where: { threadId } })` typecheck error

- **Type:** bug (pre-existing, NOT introduced by the newsletter/account/loading work)
- **Discovered:** 2026-07-20 engagement close-out. `pnpm typecheck` fails at
  `modules/polls/repository.ts:133` (`getPollByThreadId`) with
  `Type '{ threadId: string; }' is not assignable to type 'PollWhereUniqueInput'`.
- **Root cause:** `PollWhereUniqueInput` requires `{ id }` or `{ messageId }`, not
  `threadId`. A `threadId` lookup needs `findFirst`/`findMany` (or a unique
  compound/relation), not `findUnique`.
- **Blocked by:** None — AFK-grabbable.
- **Acceptance criteria:**
  - [ ] `pnpm typecheck` passes with zero errors (this is the only known failure).
  - [ ] `getPollByThreadId` returns the poll for a thread via a valid query.
  - [ ] Add/adjust a test if one covers poll-by-thread lookup.

## Slice 9 — Fix `thread-components.test.tsx:318` pinned-message render test

- **Type:** bug (pre-existing, NOT introduced by the current work)
- **Discovered:** 2026-07-20 engagement close-out. `pnpm test` fails a test that
  renders `ThreadLiveWrapper` with a pinned message and asserts
  `screen.getByText('📌 Pinned Message')` is present — it is not found, so the
  pinned-message rendering either regressed or the test fixture no longer matches
  the component output.
- **Blocked by:** None — AFK-grabbable (verify against current `ThreadLiveWrapper`
  / pinned-message rendering, not `comment-tree.tsx` which is separately excluded).
- **Acceptance criteria:**
  - [ ] `pnpm test` shows the pinned-message test passing, OR the test is corrected
        to match intended rendering and the change is documented.
  - [ ] Confirm the fix is unrelated to the excluded comment-tree flat/nested bug.

---

## Out-of-scope open list (NOT covered by the Phase 1–5 engagement)

These were flagged in the STRATEGY-READOUT / architecture critical-issues review
but are **explicitly outside** Phases 1–5 of this engagement. They are NOT "done",
NOT verified by this work, and are recorded here as a separate, still-open list so
they are not mistaken for closed. (See ARCHITECTURE-REPORT.md Critical Issues #1, #2.)

| # | Issue | Why out of scope | State |
|---|-------|------------------|-------|
| O1 | **No CSP / security headers** — RESOLVED (2026-07-20). `next.config.ts` now exports `headers()` with CSP `Report-Only` (default-src 'self', img-src allows only `*.blob.vercel-storage.com`), `Strict-Transport-Security: max-age=300` (apex only, no includeSubDomains/preload), `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. CSP report collector at `app/api/csp-report/route.ts`. | Was founder-owned; policy decided, implemented. | **Closed pending report-log review.** Flip CSP from Report-Only to enforcing once the `/api/csp-report` log is clean across real traffic. |
| O1a | **CSP XSS gap — `script-src 'unsafe-inline'` without nonce.** The CSP currently does NOT mitigate XSS: `script-src`/`style-src` allow `'unsafe-inline'` because Next.js injects inline RSC/hydration scripts and no nonce is wired. The policy's value today is the *other* directives (frame-ancestors, connect-src, img-src, base-uri, form-action). True XSS mitigation needs per-request nonce via middleware threaded through `next/script` + `<Script>` tags — more plumbing, intentionally punted. | Follows from O1 implementation. | **Known gap — do NOT mark "XSS mitigated" when CSP is on.** When reviewing the report log, treat this as open. Upgrade path: generate nonce in middleware, emit `script-src 'self' 'nonce-...'`, remove `'unsafe-inline'`. |
| O2 | **WebSocket in-memory state** — thread channels / connections / typing indicators in `Map`s; multi-instance can't share. (Note: message *delivery* uses Redis pub/sub via `lib/infrastructure/redis-pubsub.ts`, so fan-out is multi-instance; per-connection subscription bookkeeping is the in-memory part.) | Not in Phase 1–5 scope; needs its own design decision (sticky sessions vs external store). | Open. Acceptable at single-instance / low-scale; revisit before horizontal scaling. |

Neither O1 nor O2 was touched, fixed, or verified by the Phase 1–5 work. Treat
them as a separate backlog from slices 1–5.
