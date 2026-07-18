# AI Cost Estimate — per active user, monthly

> Planning artifact for the `@sai` cost-gating decision (Phase 3). Not code.
> Estimates are conservative upper bounds derived from per-call cost tiers in
> `lib/services/ai-cost-classification.ts` and the per-user quotas enforced in
> code (see citations). The authoritative hard stop is the **$5.00/day global
> spend cap** (`lib/services/ai-spend-cap.ts:4`).

## Per-user daily quotas (CONFIRMED in code)

| Quota | Limit | Source |
|---|---|---|
| AI inline (`@sai`) | 3 / user / thread / day | `lib/services/ai-inline-rate-limit.ts:4` |
| AI forum-search | 20 / user / day | `lib/services/ai-search-quota.ts` (DAILY_LIMIT=20) |
| AI analysis (DNA, resolution) | 30 / user / day | `consumeAiAnalysisQuota` |
| Image moderation | 50 / day global | `lib/services/image-moderation-quota.ts` |
| Background jobs (QStash) | 450 / day global | `lib/queue/queue.ts` |
| Global AI spend | **$5.00 / day** | `lib/services/ai-spend-cap.ts:4` |

## Per-call cost tiers (CONFIRMED in code)

Cheap-and-always-on (classification/scoring, sub-cent, cacheable): text
toxicity, image moderation, forum-search classify, forum-search
cross-reference, thread DNA, resolution score, conflict detection.

Expensive-and-deliberate (synthesis, multi-source search): forum-search
synthesize (~$0.01/call), `@sai` inline reply (~$0.008/call), ai-reply
stream (~$0.008/call), thread summary (~$0.012), daily digest (~$0.015),
query warming (~$0.01/call). Source: `ESTIMATED_COST_USD` in
`lib/services/ai-cost-classification.ts`.

## Per-active-user monthly estimate

Assumes 30 days/month. "Active user" = one who hits their quotas.

### Lower bound (light user: mostly cheap calls)
- 30 analysis calls (DNA/score): 30 × $0.002 = $0.06
- 20 forum-search/day × 30 = 600 classify+synth mixed ≈ $3.00
- 3 `@sai`/day × 30 = 90 inline × $0.008 = $0.72
- **≈ $3.80 / active user / month**

### Upper bound (power user: maxes expensive quotas)
- `@sai`: 3 × 30 = 90 × $0.008 = $0.72
- forum-search synthesize: 20 × 30 = 600 × $0.01 = $6.00
- analysis: 30 × 30 = 900 × $0.002 = $1.80
- **≈ $8.50 / active user / month** — but the **$5/day global cap** clamps
  the platform total, not per user. A single power user cannot exceed $5/day
  of *global* budget on their own; contention is across all users.

### Platform-level bound (the real number)
The $5/day global cap is the floor stop-gap: at most **$150/month** of AI
spend across *all* users combined, regardless of user count. So:

- 10 active users → capped at $150/mo (cap binds before per-user sum)
- 100 active users → still capped at $150/mo

**Implication:** AI cost is effectively a fixed $150/mo ceiling today, not a
per-user variable cost. Per-user quotas exist but the global $5/day cap is the
binding constraint. Raising the ceiling (to allow growth) is the founder-level
monetization decision referenced in Phase 5 — current config prioritizes
abuse-protection over scale.

## Risk note (UNKNOWN without telemetry)
Actual per-call costs depend on token counts logged in `lib/services/ai-usage-logger.ts`.
The estimates above use the static `ESTIMATED_COST_USD` table, not live token
accounting. Promote to measured cost once `getAiSpendUsage()` telemetry is
plumbed to a dashboard.
