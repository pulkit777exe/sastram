# Knowledge Promotion System

Threads with `resolutionScore > 85`, `verifiedAt != null`, and `deletedAt = null` are auto-promoted to `KnowledgePage` by `POST /api/cron/promote-knowledge` (daily 05:00 UTC) and by the `update-threads` cron as an auxiliary task.

## Flow

1. `lib/services/knowledge-promotion.ts` `promoteThreadsToKnowledgePages()` queries `prisma.thread.findMany` with cursor batches of 100, ordered by `id`.
2. For each candidate, `synthesizedContent = aiSummary.trim() || description.trim() || name.trim()` — skips only if all are empty.
3. Checks for an existing `knowledgePage` via `findUnique`, then `upsert`s with `version: 1` on create.
4. Per-thread `try/catch` ensures one failure never blocks others; the outer `try/catch` never throws (cron best-effort).
5. Alias `autoPromoteKnowledgePages` for cron readability.

## Scheduling

- `vercel.json` schedules `/api/cron/promote-knowledge` at `0 5 * * *` (daily 05:00 UTC).
- Also called from the `update-threads` cron as an auxiliary task.
- `verifyCronAuth` with `CRON_SECRET` Bearer `timingSafeEqual`.

## Thresholds

- `KNOWLEDGE_PROMOTION_THRESHOLD = 85` (`lib/services/knowledge-promotion.ts`).
- `verifiedAt` required (OP/admin via the `markThreadVerified` server action in `modules/threads`).
- `deletedAt: null` only.

## Manual

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://sastram.wtfpulkit.dev/api/cron/promote-knowledge
```

## Model

`prisma/schema.prisma` `model KnowledgePage { id, threadId @unique, version, synthesizedContent, createdAt, updatedAt }` FK `threadId → Thread` `onDelete: Cascade`.

## Known gaps (current behavior)

- **No visibility gate**: the candidate query does not filter `visibility: PUBLIC`, so a verified private/restricted thread can be promoted. Intended semantics are PUBLIC-only; add the predicate before relying on KnowledgePage as a public surface.
- **Name fallback**: if both `aiSummary` and `description` are empty, the thread name becomes the page body. This produces low-value pages; prefer skipping instead.
- **Version is not bumped**: updates overwrite `synthesizedContent` but leave `version` at 1. If version history matters, increment on update or add a revision table.
