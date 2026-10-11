# ADR-0001 — improve-codebase-architecture grilling decisions (2026-10-11)

First ADR in this repo (`docs/ARCHITECTURE-REVIEW.md` noted none existed).
Records the human calls from the D1–D9 grilling loop so future passes don't re-litigate.

## Bulk save contract: all-or-nothing

`addManyToCollection` rolls back on any non-duplicate failure.
Duplicates still skip (409 path is DB-honest via unique constraint).
Rationale: simpler contract to reason about; single response, no partial HTTP states.

## Metadata validation: strict

Collection writes reject unknown metadata `type` values.
Only `graph | canvas | summary | ai_synthesis` persist; no unknown passthrough.
Rationale: keeps list renderer and markdown exporter total over the union.

## AI spend billing: routes consume, workers skip

Sync routes call `enforceAiSpendCap`; workers skip consumption when the
request-scoped `alreadyBilled` idempotency key is present.
Rationale: fixes double-billing on expensive paths without requiring
worker coverage for every sync path (ai-reply stream is sync).

## Execution order

Collections (D1+D2+D3) → quick deletions (D9) → thread vertical (D4+D5+D6) → AI seam (D7+D8).
Rationale: hottest code with a live divergence bug first, smallest blast radius.
