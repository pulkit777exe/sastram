# Ubiquitous Language

## Core entities

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread** | A discussion topic — the central unit of conversation. Created by a user. Has *Messages*, *Tags*, a *Poll*, a *Resolution Score*, and *Thread DNA*. May be forked from another *Thread*. | Section |
| **Message** | A single post within a *Thread*. Can be threaded (reply to another *Message* via `parentId`), pinned, edited, or soft-deleted (via `deletedAt`). | Comment, post, reply |
| **User** | An authentication identity with a profile. Has a role (USER, MODERATOR, ADMIN), a status (ACTIVE, SUSPENDED, BANNED). | Account, member |
| **Tag** | A label assigned to a *Thread*. Has a name, slug, and color. Stored as `ThreadTag` in DB. | Label, category |

## Membership & access

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Member** | A *User*'s participation in a *Thread*. There is no membership table — access is derived from thread `visibility`, `createdBy`, and accepted `ThreadInvitation` rows. | Membership, SectionMember |
| **Invitation** | An invitation for a *User* to join a private/restricted *Thread*. Stored as `ThreadInvitation` in DB. | ThreadInvitation |
| **Ban** | A restriction preventing a *User* from participating in a specific *Thread*. Stored as `UserBan` in DB. | UserBan |

## Content analysis

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread DNA** | An AI-generated classification of a *Thread*: question type, expertise level, topics, and estimated read time. | ThreadDna |
| **Resolution Score** | A stored numeric value (0–100) on `Thread.resolutionScore` indicating how resolved the discussion appeared when the AI last scored it (AI-estimated signal). It is a snapshot, not a live value: time does not rewrite the stored score. Trust in the score is expressed separately as *Confidence Decay* and optional human *Verification*. | Score, resolution, resolutionScore |
| **Confidence Decay** | A derived, time-based confidence in a *Resolution Score* — it is not a mutation of the stored score (AI-estimated effective confidence). It is computed from `verifiedAt` (human verification) when present, otherwise `lastVerifiedAt` (the last AI scoring run). The daily cron and staleness sweep use the decayed confidence to decide when a *Thread* needs re-scoring; the UI shows it as effective confidence. | Aging, decay, effective score |
| **Thread Summary** | An AI-generated plain-text summary of a *Thread*'s discussion. | AiSummary |
| **Stale Content** | A flagged state (`isOutdated`) indicating a *Thread* may contain outdated information. | Outdated |

## Verification & knowledge

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Verification** | A human (thread creator or MODERATOR/ADMIN) confirming that the AI-produced *Resolution Score* and synthesis are trustworthy. Stamps `Thread.verifiedAt`/`verifiedBy`, clears `isOutdated`, and raises the decay basis to the verification time. This is distinct from the Better Auth `Verification` table (OTP codes). | Verified Resolution, approval, sign-off |
| **Knowledge Page** | An auto-promoted, synthesized article for a verified high-confidence *Thread* (`Thread.resolutionScore > 85 && verifiedAt != null`). One-to-one with the *Thread* (`KnowledgePage.threadId` is unique) and versioned (`KnowledgePage.version`). Promotion is intended for PUBLIC threads only. | KnowledgePage, wiki, article |
| **Fork** | A new *Thread* created from an existing *Thread* or external seed, linked by `Thread.forkedFromId` (self-FK) when parented in-app. Unified by `forkKind`: ASSUMPTION, CONTINUE, REMIX_AI, EXTERNAL. Only readable sources may be forked; visibility never widens implicitly. | Branch, copy, clone |
| **Fork Kind** | Intent of a fork: ASSUMPTION (changed premise), CONTINUE (revive/extend), REMIX_AI (edit sources/claims, explicit re-run later), EXTERNAL (user-provided URL seed). | Fork type, mode |
| **Carry-over** | Snapshot context copied at fork time: SUMMARY (AI summary), SELECTED_MESSAGES (bounded, access-checked), or NONE. Never live-synced and never copied into a wider visibility. | Fork context, seed snapshot |
| **External Fork Payload** | For EXTERNAL forks: user-provided title, short excerpt, source link, and attribution only (SSRF-safe). Full third-party content is never mirrored. | Imported seed, external source |
| **Supersede** | Fork-level proposal state (NONE/PROPOSED/ACCEPTED/DECLINED) where a fork may propose to supersede its parent. Parent OP or moderator/admin can decide; acceptance marks preferred continuation without merge/delete. | Preferred continuation proposal |
| **Lineage** | The ancestry/descendant chain formed via `Thread.forkedFromId` and fork metadata. One parent link per thread; trees are reconstructed by traversal (respecting viewer access). | Fork tree, ancestry, provenance |

## Thread relationships

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread Relation** | A stored similarity link between two *Threads* (`ThreadRelation.similarity`, 0.0–1.0 cosine). Used for the "Related threads" panel and graph. It does **not** currently store a relation kind (supersedes/references/duplicates); those are editorial concepts, not schema fields. | RelatedThreads, edge |
| **Thread Subscription** | A *User*'s intent to follow updates on a *Thread*. Triggers notifications for new *Messages*. | Subscription, follow |
| **Bookmark** | A *User*'s saved reference to a *Thread* for later retrieval. | Saved, favorite |

## Moderation

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Moderation Rule** | A configurable regex pattern that filters prohibited content in *Messages* or *Thread* descriptions. | Filter, rule |
| **Report** | A *User*'s flagging of a *Message* or *Thread* for moderator review. Has a category and status. | Flag, complaint |
| **Appeal** | A *User*'s request to reverse a moderation action. Has a status (pending, approved, rejected). | Review request |
| **Appeal Vote** | A jury vote on an *Appeal* — 3 random MODERATORs, 2/3 majority decides. Stored as `AppealVote`. | Jury vote |

## Knowledge & engagement

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Collection** | A workspace of saved threads + searches (`Collection` + `CollectionItem`), exportable as Markdown with `[n]` footnotes. | Workspace, folder |
| **Bounty** | A reward attached to a *Thread* (`amount`, `isClaimed`). | Reward, prize |
| **Save Payload** | The validated shape for adding an item to a *Collection* (`threadId`/`sessionId`/`messageId`/`metadata`, one Zod schema). | Add schema, save body |
| **Metadata Kind** | The typed discriminant for collection item snapshots (`graph`/`canvas`/`summary`/`ai_synthesis`). | Metadata type |
| **Fact-Check Status** | A per-*Message* badge (`UNCHECKED` / `VERIFIED` / `DISPUTED`) shown as an AI-estimated signal, not an authoritative truth determination. | Fact check |
| **Poll Market** | A *Poll* with `isMarket` + `resolvedOptionIndex` — a resolvable prediction market. | Betting, market |

## Real-time & infrastructure

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **AI Pipeline** | Background job queues (QStash) that process *Thread DNA*, *Resolution Score*, *Thread Summary*, conflict detection, daily digest, and AI inline suggestions. Jobs retry 1x by default (3x for `email`); a daily QStash publish cap (450) drops non-critical jobs past the limit, never `email`. | Job queue, worker |
| **Dashboard** | The user's personal landing page showing their *Threads*, recent activity, and relevant tags. | Home, feed |
| **Spend Cap** | Dollar-based daily limit ($5.00) for AI usage, enforced via Redis INCRBYFLOAT. | AI budget |
| **Daily Quota** | Per-user/day Redis quotas for AI inline, AI analysis, AI search, and image moderation. | Rate limit |

## Relationships

- A **Thread** has many **Messages**, **Tags** (via *ThreadTagRelation*), and zero or one **Poll**
- A **Message** belongs to exactly one **Thread** and may have a `parentId` referencing another **Message** (reply tree)
- A **User** participates in many **Threads**; access is derived from thread visibility + invitations, not a join table
- A **Tag** is assigned to many **Threads** (via *ThreadTagRelation*)
- A **Thread** can relate to other **Threads** via **Thread Relations** (stored similarity, many-to-many)
- A **Thread** may be forked from one source **Thread** (`forkedFromId`); following those links forms its **Lineage**
- A **Thread** has at most one **Knowledge Page** (`threadId` unique), created only after **Verification**
- A **Resolution Score** belongs to exactly one **Thread**; its *Confidence Decay* is derived, not stored on the score
- A **Thread DNA** classification belongs to exactly one **Thread**

## Example dialogue

> **Dev:** "When a **User** creates a new **Thread**, how is access controlled?"
> **Domain expert:** "The thread has a `visibility` field. Public threads are readable by anyone. Private/restricted threads are accessible only by the creator, accepted invitees, or MODERATOR/ADMIN roles."

> **Dev:** "And when a **User** is BANNED from a **Thread**, how is that enforced?"
> **Domain expert:** "The `UserBan` record blocks their write operations. Thread access checks in `lib/thread-access.ts` verify bans before allowing posts."

> **Dev:** "What triggers **Confidence Decay** on a **Resolution Score**?"
> **Domain expert:** "Confidence ages from the resolution's provenance — `verifiedAt` when a human verified it, otherwise `lastVerifiedAt` when the **AI Pipeline** last scored it. The stored score itself never decays; the daily cron and the staleness sweep use the decayed confidence to decide when a thread needs re-scoring."

> **Dev:** "When does a **Thread** become a **Knowledge Page**?"
> **Domain expert:** "After **Verification** (`verifiedAt` set) and a **Resolution Score** above 85, the promotion cron creates the one-to-one **Knowledge Page**. It should only promote PUBLIC threads; the current promotion service does not yet enforce that visibility gate."

> **Dev:** "What is the difference between a **Fork** and a **Thread Relation**?"
> **Domain expert:** "A **Fork** is a new thread with a parent link (`forkedFromId`), so it has **Lineage**. A **Thread Relation** is only a stored similarity score between two existing threads — it does not imply copying, parentage, or a typed relationship."

## Flagged ambiguities

- **"Tag" vs "ThreadTag"** — The database model is `ThreadTag` but the domain concept is simply **Tag**. The "Thread" prefix is redundant since tags only apply to threads. Keep `ThreadTag` in the DB for disambiguation but refer to the concept as **Tag** in domain language.
- **"Member" vs "Membership"** — There is no membership table. Access is derived from thread visibility, creator, and invitations. The term **Member** is used loosely to describe a user's relationship to a thread, but it is not a database entity.
- **"Verification" overload** — Domain **Verification** means human confirmation of a resolution (`Thread.verifiedAt`/`verifiedBy`). The Better Auth `Verification` model stores OTP codes and is unrelated. Qualify the auth one as "OTP verification" in prose.
- **"Thread Relation" type** — Earlier docs claimed relation types (supersedes/references/duplicates), but `ThreadRelation` stores only `similarity`. Do not promise typed relations until the schema has a kind field.
- **"Knowledge Page" visibility** — Promotion currently filters only on score + `verifiedAt`, not `Thread.visibility`. Treat PUBLIC-only promotion as the intended rule and a known implementation gap, not as current behavior.
