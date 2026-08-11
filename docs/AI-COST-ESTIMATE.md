# AI Cost Estimate — per active user, monthly

> Planning artifact for the `@sai` cost-gating decision. Not code.
> Estimates are conservative upper bounds derived from per-call cost tiers in
> `lib/services/ai-cost-classification.ts` and the per-user quotas enforced in
> code (see citations). The authoritative hard stop is the **.00/day global
> spend cap** (`lib/services/ai-spend-cap.ts`).
>
> **Last updated:** 2026-08-11 (post-refactor: quota sources updated to reflect
> consolidation into `lib/services/daily-quota.ts`).

## Per-user daily quotas (CONFIRMED in code)

| Quota | Limit | Source |
|---|---|---|
| AI inline (`@sai`) | 3 / user / thread / day | `lib/services/daily-quota.ts` (`consumeAiInlineQuota`) |
| AI forum-search | 20 / user / day | `lib/services/daily-quota.ts` (`consumeAiSearchQuota`) |
| AI analysis (DNA, resolution) | 30 / user / day | `lib/services/daily-quota.ts` (`consumeAiAnalysisQuota`) |
| Image moderation | 50 / day global | `lib/services/daily-quota.ts` (`consumeImageModerationQuota`) |
| Background jobs (QStash) | 450 / day global | `lib/services/queue.ts` |
| Global AI spend | **.00 / day** | `lib/services/ai-spend-cap.ts` |

**Note:** The pre-refactor codebase had 4 separate quota files (`ai-inline-rate-limit.ts`,
`ai-search-quota.ts`, `image-moderation-quota.ts`, and the spend cap). These were
consolidated into `lib/services/daily-quota.ts` using a `createDailyQuota` factory
pattern. The limits above are unchanged.

## Spend cap enforcement (CONFIRMED in code)

The spend cap is enforced at multiple layers:

| Layer | Function | Behavior |
|---|---|---|
| Pre-flight check | `checkAiSpendCap()` | Read-only check; does not consume budget |
| Authoritative gate | `consumeSpendCap(costUsd)` | Atomically checks + increments budget |
| Combined gate | `enforceAiSpendCap(path)` | Classifies cost + calls `consumeSpendCap` |

All three functions **fail open** when Redis is unavailable (return `{ allowed: true }`).
This is a documented tradeoff: losing Redis should not take AI features down.

## Per-call cost tiers (CONFIRMED in code)

Cheap-and-always-on (classification/scoring, sub-cent, cacheable): text
toxicity, image moderation, forum-search classify, forum-search
cross-reference, thread DNA, resolution score, conflict detection.

Expensive-and-deliberate (synthesis, multi-source search): forum-search
synthesize (~/usr/bin/zsh.01/call), `@sai` inline reply (~/usr/bin/zsh.008/call), ai-reply
stream (~/usr/bin/zsh.008/call), thread summary (~/usr/bin/zsh.012), daily digest (~/usr/bin/zsh.015),
query warming (~/usr/bin/zsh.01/call). Source: `ESTIMATED_COST_USD` in
`lib/services/ai-cost-classification.ts`.

## Per-active-user monthly estimate

Assumes 30 days/month. "Active user" = one who hits their quotas.

### Lower bound (light user: mostly cheap calls)
- 30 analysis calls (DNA/score): 30 x /usr/bin/zsh.002 = /usr/bin/zsh.06
- 20 forum-search/day x 30 = 600 classify+synth mixed ≈ .00
- 3 `@sai`/day x 30 = 90 inline x /usr/bin/zsh.008 = /usr/bin/zsh.72
- **≈ .80 / active user / month**

### Upper bound (power user: maxes expensive quotas)
- `@sai`: 3 x 30 = 90 x /usr/bin/zsh.008 = /usr/bin/zsh.72
- forum-search synthesize: 20 x 30 = 600 x /usr/bin/zsh.01 = .00
- analysis: 30 x 30 = 900 x /usr/bin/zsh.002 = .80
- **≈ .50 / active user / month** — but the **/day global cap** clamps
  the platform total, not per user. A single power user cannot exceed /day
  of *global* budget on their own; contention is across all users.

### Platform-level bound (the real number)
The /day global cap is the floor stop-gap: at most **/month** of AI
spend across *all* users combined, regardless of user count. So:

- 10 active users → capped at /mo (cap binds before per-user sum)
- 100 active users → still capped at /mo

**Implication:** AI cost is effectively a fixed /mo ceiling today, not a
per-user variable cost. Per-user quotas exist but the global /day cap is the
binding constraint. Raising the ceiling (to allow growth) is the founder-level
monetization decision — current config prioritizes abuse-protection over scale.

## Assumption: estimates are cache-miss worst case
These per-user figures assume every call is a cache MISS (the user maxes their
daily quotas). The only AI-search cache that exists is an exact normalized-query
SHA-256 hash cache (`modules/ai-search/cache.ts`) — there is NO pgvector /
semantic / embedding similarity cache. So repeat-identical queries are free, but
semantically-similar queries are NOT deduplicated. The estimates are therefore
conservative upper bounds and do NOT rely on any semantic cache existing. This
is why founder decision D1 (keep the /day global cap, no monetization) holds:
the cap is a hard /mo ceiling independent of caching.

## Risk note (UNKNOWN without telemetry)
Actual per-call costs depend on token counts logged in `lib/services/ai-usage-logger.ts`.
The estimates above use the static `ESTIMATED_COST_USD` table, not live token
accounting. Promote to measured cost once `getAiSpendUsage()` telemetry is
plumbed to a dashboard (see `app/api/ai/spend/route.ts`).
