# Knowledge Promotion System

Threads with `resolutionScore > 85` and `verifiedAt != null` are auto-promoted to `KnowledgePage` by the cron `POST /api/cron/promote-knowledge` (daily 05:00 UTC).

## Flow

1. `lib/services/knowledge-promotion.ts:21` `promoteThreadsToKnowledgePages()` queries `prisma.thread.findMany` with cursor batch `100` where `resolutionScore > 85 && verifiedAt not null && deletedAt null`.
2. For each candidate, `synthesizedContent = aiSummary.trim() || description.trim() || name.trim()` — skips if empty.
3. Checks existing `knowledgePage` via `findUnique` (idempotent) then `upsert` with `version:1`.
4. Per-thread `try/catch` ensures one failure never blocks others; outer `try/catch` never throws (cron best-effort).
5. Alias `autoPromoteKnowledgePages` for cron readability.

## Scheduling

- `vercel.json:21` `crons: { path: "/api/cron/promote-knowledge", schedule: "0 5 * * *" }`
- Called from `update-threads` cron as auxiliary task and standalone.
- `verifyCronAuth` with `CRON_SECRET` Bearer `timingSafeEqual`.

## Thresholds

- `KNOWLEDGE_PROMOTION_THRESHOLD = 85` (`lib/services/knowledge-promotion.ts:12`)
- `verifiedAt` required (OP/admin via `POST /api/threads/[threadId]/verify` or `modules/threads/actions:markThreadVerified`).
- `deletedAt: null` only.

## Manual

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://sastram.wtfpulkit.dev/api/cron/promote-knowledge
```

## Model

`prisma/schema.prisma:245` `model KnowledgePage { id, threadId @unique, version, synthesizedContent, createdAt, updatedAt }` FK `threadId → Thread` `onDelete: Cascade`.
