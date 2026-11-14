# Knowledge Promotion System

Threads with `resolutionScore > 85`, `verifiedAt != null`, `visibility = PUBLIC`,
`isOutdated = false`, and `deletedAt = null` are auto-promoted to `KnowledgePage`
by `GET /api/cron/promote-knowledge` (daily 05:00 UTC). It is the only trigger.

## Eligibility

A thread is promoted only while **all** of these are true:

- `visibility = PUBLIC` — private/restricted threads never become public pages.
- `deletedAt = null` — deleted threads are never promoted.
- `isOutdated = false` — stale answers are not published as current knowledge.
- `verifiedAt != null` — a human (OP/admin) confirmed the resolution.
- `resolutionScore > 85` — above `KNOWLEDGE_PROMOTION_THRESHOLD`.
- `aiSummary` is non-empty after trimming. The thread name and description are
  never used as fallbacks; a page without a real synthesized answer is skipped.

## Flow

1. `lib/services/knowledge-promotion.ts` `promoteThreadsToKnowledgePages()` first
   deletes pages whose thread no longer meets the eligibility rules above
   (demotion/unpublish). This includes threads that turned private, were deleted,
   were marked outdated, lost verification, or dropped to/below the threshold.
2. It then queries `prisma.thread.findMany` with cursor batches of 100, ordered
   by `id`, using the same eligibility predicates.
3. For each candidate, `synthesizedContent = aiSummary.trim()`. Missing/blank
   summaries are skipped.
4. An existing page with identical content is left untouched (`unchanged`), so
   `version` only advances when the content actually changes.
5. New pages are created with `version: 1`; changed pages are updated with
   `version: { increment: 1 }`.
6. Per-thread `try/catch` ensures one failure never blocks others; the outer
   `try/catch` never throws (cron best-effort). Demotion failures are logged and
   do not prevent promotion.

The result reports `candidates`, `created`, `updated`, `unchanged`, `demoted`,
and `skipped`.

## Scheduling

- `vercel.json` schedules `/api/cron/promote-knowledge` at `0 5 * * *` (daily 05:00 UTC).
- Vercel invokes cron paths with `GET`; the route exports `GET`.
- The standalone cron is the only trigger; `update-threads` does not run promotion.
- `verifyCronAuth` with `CRON_SECRET` Bearer `timingSafeEqual`.

## Thresholds

- `KNOWLEDGE_PROMOTION_THRESHOLD = 85` (`lib/services/knowledge-promotion.ts`).
- `verifiedAt` required (OP/admin via the `markThreadVerified` server action in `modules/threads`).
- `visibility: PUBLIC`, `isOutdated: false`, `deletedAt: null` required.

## Manual

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://sastram.wtfpulkit.dev/api/cron/promote-knowledge
```

## Model

`prisma/schema.prisma` `model KnowledgePage { id, threadId @unique, version, synthesizedContent, createdAt, updatedAt }` FK `threadId → Thread` `onDelete: Cascade`.

Demotion deletes the `KnowledgePage` row; there is no separate published flag or
soft-delete column. The public knowledge surface must therefore only read pages
whose thread still satisfies the eligibility predicates.
