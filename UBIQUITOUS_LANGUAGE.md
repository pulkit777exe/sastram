# Ubiquitous Language

## Core entities

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread** | A discussion topic — the central unit of conversation. Created by a user. Has *Messages*, *Tags*, a *Poll*, a *Resolution Score*, and *Thread DNA*. | Section |
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
| **Resolution Score** | A numeric value (0–100) indicating how resolved a discussion appears. Computed by AI and adjusted by *Confidence Decay*. | Score, resolution, resolutionScore |
| **Confidence Decay** | A time-based reduction applied to the *Resolution Score* when the *Thread* has not been verified recently. | Aging, decay |
| **Thread Summary** | An AI-generated plain-text summary of a *Thread*'s discussion. | AiSummary |
| **Stale Content** | A flagged state (`isOutdated`) indicating a *Thread* may contain outdated information. | Outdated |

## Thread relationships

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread Relation** | A link between two *Threads* with a type (supersedes, references, duplicates). Used for the "Related threads" panel. | RelatedThreads |
| **Thread Subscription** | A *User*'s intent to follow updates on a *Thread*. Triggers notifications for new *Messages*. | Subscription, follow |
| **Bookmark** | A *User*'s saved reference to a *Thread* for later retrieval. | Saved, favorite |

## Moderation

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Moderation Rule** | A configurable regex pattern that filters prohibited content in *Messages* or *Thread* descriptions. | Filter, rule |
| **Report** | A *User*'s flagging of a *Message* or *Thread* for moderator review. Has a category and status. | Flag, complaint |
| **Appeal** | A *User*'s request to reverse a moderation action. Has a status (pending, approved, rejected). | Review request |

## Real-time & infrastructure

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **AI Pipeline** | Background job queues (QStash) that process *Thread DNA*, *Resolution Score*, *Thread Summary*, conflict detection, daily digest, and AI inline suggestions. Jobs retry up to 3 times. | Job queue, worker |
| **Dashboard** | The user's personal landing page showing their *Threads*, recent activity, and relevant tags. | Home, feed |
| **Spend Cap** | Dollar-based daily limit ($5.00) for AI usage, enforced via Redis INCRBYFLOAT. | AI budget |
| **Daily Quota** | Per-user/day Redis quotas for AI inline, AI analysis, AI search, and image moderation. | Rate limit |

## Relationships

- A **Thread** has many **Messages**, **Tags** (via *ThreadTagRelation*), and zero or one **Poll**
- A **Message** belongs to exactly one **Thread** and may have a `parentId` referencing another **Message** (reply tree)
- A **User** has many **Memberships** (access derived from thread visibility + invitations, not a join table)
- A **Tag** is assigned to many **Threads** (via *ThreadTagRelation*)
- A **Thread** can relate to other **Threads** via **Thread Relations** (many-to-many)
- A **Resolution Score** belongs to exactly one **Thread** and may decay via **Confidence Decay**
- A **Thread DNA** classification belongs to exactly one **Thread**

## Example dialogue

> **Dev:** "When a **User** creates a new **Thread**, how is access controlled?"
> **Domain expert:** "The thread has a `visibility` field. Public threads are readable by anyone. Private/restricted threads are accessible only by the creator, accepted invitees, or MODERATOR/ADMIN roles."

> **Dev:** "And when a **User** is BANNED from a **Thread**, how is that enforced?"
> **Domain expert:** "The `UserBan` record blocks their write operations. Thread access checks in `modules/threads/access.ts` verify bans before allowing posts."

> **Dev:** "What triggers **Confidence Decay** on a **Resolution Score**?"
> **Domain expert:** "When a new **Message** is posted, the `lastVerifiedAt` field is checked. If older than the threshold, the score decays proportionally until recalculated by the **AI Pipeline**."

## Flagged ambiguities

- **"Tag" vs "ThreadTag"** — The database model is `ThreadTag` but the domain concept is simply **Tag**. The "Thread" prefix is redundant since tags only apply to threads. Keep `ThreadTag` in the DB for disambiguation but refer to the concept as **Tag** in domain language.
- **"Member" vs "Membership"** — There is no membership table. Access is derived from thread visibility, creator, and invitations. The term **Member** is used loosely to describe a user's relationship to a thread, but it is not a database entity.
