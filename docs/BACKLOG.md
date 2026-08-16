# Backlog — post-refactor actionable items

> **Last updated:** August 2026 (post-architecture refactor)
> **Canonical reference:** [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
> This backlog tracks actionable work items. For the verified system description, see the canonical reference.

---

## Completed Slices (from pre-refactor engagement)

| Slice | Category | State | Why |
|---|---|---|---|
| 1 Cost classifier → all gates | enhancement | **RESOLVED** | `evaluateAiCostGate` wired into `@sai` inline, forum-search, thread-summary, ai-reply-stream |
| 2 Spend telemetry dashboard | enhancement | **RESOLVED** | `app/api/ai/spend/route.ts` exposes `getAiSpendUsage()`; admin spend link added |
| 3 Moderation/image spend-cap gap | enhancement | **RESOLVED** | Both paths charge global `$5/day` cap via `consumeSpendCap`; fail-open on Redis outage |
| 4 Thread-create/cron enqueue gates | enhancement | **RESOLVED** | `enforceAiSpendCap` wired into thread-create and cron enqueue paths |
| 5 Daily-digest/query-warming cap | enhancement | **RESOLVED** | Cron routes and query-warming pre-flight the spend cap |
| 6 Monetization / cap ceiling | decision | **RESOLVED** | Founder decision: keep `$5/day` global cap, no monetization |
| 7 Cold-start population | decision | **RESOLVED** | Founder decision: invited alpha cohort first |
| 8 `prisma.poll.findUnique` typecheck error | bug | **RESOLVED** | Switched to `findFirst` |
| 9 pinned-message render test | bug | **RESOLVED** | Test assertion corrected |
| 10 Apply message-level polls migration | bug/blocker | **RESOLVED** | Migration reconciled via `migrate resolve --applied` |
| 11 `Appeal.userId` SetNull warning | bug | **RESOLVED** | Schema fixed + migration applied |

---

## Architecture Refactor (completed August 2026)

The following structural changes were made to simplify the codebase:

### Removed
- `modules/ws/` — WebSocket publisher module (was no-op stubs)
- `modules/chat/` — Chat module (unused)
- `modules/reputation/` — Reputation system (never built)
- `modules/badges/` — Badge system (never built)
- `lib/services/blob.ts` — Blob service (consolidated)
- `lib/services/logger.ts` — Logger service (consolidated into infrastructure)
- `lib/dedupe.ts` — Deduplication utility (consolidated into job-dedup.ts)
- `lib/ai/daily-quota.ts` — Consolidated into `daily-quota.ts`
- `lib/ai/daily-quota.ts` — Consolidated into `daily-quota.ts`
- `lib/services/image-moderation-quota.ts` — Consolidated into `daily-quota.ts`

### Consolidated
- 4 quota services → `lib/services/daily-quota.ts` (single `createDailyQuota` factory)
- Redis connection logic → `lib/infrastructure/redis.ts` + `lib/infrastructure/redis-upstash.ts`
- Deduplication → `lib/services/job-dedup.ts`

### Added
- `modules/threads/access.ts` — Thread access control (visibilityFilter, requireThreadAccessOrThrow, etc.)
- `lib/actions/result.ts` — Action envelope helpers (actionSuccess, actionFailure)

### Simplified
- All domain modules cleaned of dead code
- Thread access enforced on upload route
- QStash verification fail-close (rejects invalid signatures)
- Search visibility enforced (private/restricted threads not leaked)

### Current State
- 24 modules (verified: `find modules/ -mindepth 1 -maxdepth 1 -type d | wc -l`)
- 35 API routes (verified: `find app/api/ -type f -name 'route.ts' | wc -l`)
- 30 Prisma models (verified: `grep -c "^model " prisma/schema.prisma`)
- 47 test files, 297+ passing (verified: `pnpm test`)

---

## Open Items (out-of-scope, still open)

| # | Issue | Why open | State |
|---|-------|----------|-------|
| O1 | **CSP / security headers** — Active in `proxy.ts` (per-request nonce). Report-Only by default. | Flip to enforcing after report-log review | **Open pending report-log review** |
| O1a | **CSP XSS gap** — Next.js bootstrap `<script>` not nonced. | Next 16 does not auto-nonce bootstrap scripts | **Open.** Keep Report-Only until bootstrap nonced |
| O1b | **CSRF on server actions** | Mitigated by proxy.ts origin/referer check | **Mitigated in practice** |
| O2 | **No real-time delivery layer.** WebSocket removed. Non-AI updates poll-only (20s normal, 3s during @sai pending). SSE for AI replies. Redis pub/sub publish-only. | Needs design decision (SSE vs WS) before horizontal scaling | **Open. Acceptable at single-instance scale** |

---

## Future Work (not yet started)

### Security Hardening
- [ ] Flip CSP to enforcing (`CSP_REPORT_ONLY=false`) after report-log review
- [ ] Add nonce to Next.js bootstrap script (or wait for Next 16 `experimental.nonce`)
- [ ] Add double-submit CSRF token (only if attack surface changes)
- [ ] Security scanning in CI (CodeQL or Snyk)

### Real-Time Delivery
- [ ] Design real-time delivery for non-AI events (SSE or WebSocket)
- [ ] Add Redis subscriber for cross-instance notification fan-out
- [ ] Client hook for real-time connection (replacing poll-only delivery)

### Frontend Parity
- [ ] Message editing with history UI
- [ ] @mentions with notifications UI
- [ ] Polls UI (backend exists)
- [ ] Thread tagging UI (backend exists)
- [ ] Typing indicators in thread UI
- [ ] @sai inline trigger UI
- [ ] Notification count in header
- [ ] Mark notifications as read (single + all)
- [ ] Read receipts UI
- [ ] User preferences UI
- [ ] Thread invitations UI
- [ ] Access management UI
- [ ] User profile edit form
- [ ] Avatar + banner upload UI

### Testing & CI
- [ ] Add API integration tests (supertest or similar)
- [ ] Wire E2E tests into CI pipeline
- [ ] Add `pnpm build` to CI
- [ ] Add security scanning to CI

### Performance
- [ ] Message pagination (cursor-based for long threads)
- [ ] Optimistic UI updates
- [ ] Image lazy loading
- [ ] Performance monitoring (Lighthouse CI, Web Vitals)

### Infrastructure
- [ ] Internationalization (i18n framework)
- [ ] Accessibility audit (ARIA labels, keyboard nav, screen reader)
