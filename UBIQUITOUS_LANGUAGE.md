# Ubiquitous Language

## Core entities

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread** | A discussion topic — the central unit of conversation. Created by a user, belongs optionally to a *Community*. Has *Messages*, *Tags*, a *Poll*, a *Resolution Score*, and *Thread DNA*. | Section |
| **Message** | A single post within a *Thread*. Can be threaded (reply to another *Message* via `parentId`), pinned, edited, or deleted (soft-delete via `deletedAt`). | Comment, post, reply |
| **Community** | A named group of *Threads* on a shared theme. Has visibility controls (public, private, unlisted). A *Thread* can exist without a *Community*. | Category, forum, group |
| **User** | An authentication identity with a profile. Has a role (member, moderator, admin), a status (active, suspended, banned), and reputation points. | Account, member |
| **Tag** | A label assigned to a *Thread*. Has a name, slug, and color. | Label, category |

## Membership & access

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Membership** | A record linking a *User* to a *Thread*, carrying a role (owner, moderator, member) and a status (active, invited, left, removed). | SectionMember |
| **Invitation** | An invitation from an existing member for a *User* to join a *Thread*. Has an optional expiration. | ThreadInvitation |
| **Ban** | A restriction preventing a *User* from participating in a specific *Thread*. Has a reason, duration (optional), and issuer. | UserBan |

## Content analysis

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread DNA** | An AI-generated classification of a *Thread*: the type of question (factual, opinion, advice, etc.), the expertise level required, the set of topics discussed, and an estimated read time. | ThreadDna |
| **Resolution Score** | A numeric value (0–100) indicating how resolved a discussion appears. Computed by an AI model and adjusted by *Confidence Decay*. | Score, resolution, resolutionScore |
| **Confidence Decay** | A time-based reduction applied to the *Resolution Score* when the *Thread* has not been verified recently. The longer since `lastVerifiedAt`, the more the score decays. | Aging, decay |
| **Thread Summary** | An AI-generated plain-text summary of a *Thread*'s discussion. | AiSummary |
| **Stale Content** | A flagged state (`isOutdated`) indicating a *Thread* may contain information that no longer reflects the current state of the topic. | Outdated |

## Thread relationships

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Thread Relation** | A link between two *Threads*, optionally with a type describing the relationship (supersedes, references, duplicates). Used to build the "Related threads" panel. | RelatedThreads |
| **Thread Subscription** | A *User*'s intent to follow updates on a *Thread*. When active, the user receives notifications for new *Messages*. | Subscription, follow |
| **Bookmark** | A *User*'s saved reference to a *Thread* for later retrieval. | Saved, favorite |

## Moderation

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Moderation Rule** | A configurable pattern (regex) that filters prohibited content in *Messages* or *Thread* descriptions. | Filter, rule |
| **Report** | A *User*'s flagging of a *Message* or *Thread* for moderator review. Has a category (spam, harassment, misinformation, etc.) and a status (pending, resolved, dismissed). | Flag, complaint |
| **Appeal** | A *User*'s request to reverse a moderation action (e.g., an *Appeal* against a *Ban*). Has a status (pending, approved, rejected). | Review request |

## Real-time & infrastructure

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **WebSocket** | The persistent connection used to push live updates (new *Messages*, presence indicators) to connected clients. State is in-memory (single-server only). | Socket, WS |
| **AI Pipeline** | A set of background job queues (QStash) that process *Thread DNA*, *Resolution Score*, *Thread Summary*, conflict detection, daily digest, and AI inline suggestions. Jobs retry up to 3 times with exponential backoff. | Job queue, worker |
| **Dashboard** | The user's personal landing page showing an aggregated view of their *Threads*, recent activity, and relevant tags. | Home, feed |

## Relationships

- A **Thread** belongs to zero or one **Community**
- A **Thread** has many **Messages**, **Tags** (via *ThreadTagRelation*), and zero or one **Poll**
- A **Message** belongs to exactly one **Thread** and may have a `parentId` referencing another **Message** (forming a reply tree)
- A **User** has many **Memberships** (one per *Thread*), each with a role and status
- A **Tag** is assigned to many **Threads** (via *ThreadTagRelation*)
- A **Thread** can relate to other **Threads** via **Thread Relations** (many-to-many)
- A **Resolution Score** belongs to exactly one **Thread** and may decay via **Confidence Decay**
- A **Thread DNA** classification belongs to exactly one **Thread**

## Example dialogue

> **Dev:** "When a **User** creates a new **Thread** in a **Community**, do we need a **Membership** record?"
> **Domain expert:** "Yes — the creator gets a **Membership** with role OWNER and status ACTIVE right away. Other users need to be INVITED or join independently."
>
> **Dev:** "And when a **User** is BANNED from a **Thread**, does their **Membership** status change?"
> **Domain expert:** "Not exactly — the **Ban** record handles restriction independently. The **Membership** stays ACTIVE so we can show they're still a member, but all their write operations are blocked."
>
> **Dev:** "What triggers **Confidence Decay** on a **Resolution Score**?"
> **Domain expert:** "Every time a new **Message** is posted in the **Thread**, the `lastVerifiedAt` field is checked. If that's older than 30 days, the score decays proportionally until it's recalculated by the **AI Pipeline**."

## Flagged ambiguities

- **"Section" vs "Thread"** — The database table is named `sections`, the model is `Section`, and the relationship field uses `sectionId`. But every domain-facing relation table (`ThreadTag`, `ThreadTagRelation`, `ThreadSubscription`, `ThreadInvitation`, `ThreadRelation`) and every module (`modules/threads/`) uses "Thread" language. The UI and the entire business domain treats these as **Threads**. Recommendation: rename the database model from `Section` to `Thread` (requires migration), or at minimum add `@@map("threads")` to align with domain language. The current dual naming is the single largest friction point in the codebase.
- **"Message" vs "Comment"** — The existing code uses "Message" consistently. The 201 `@@map("messages")` in the Prisma schema, API routes, and components all agree. No action needed.
- **"Tag" vs "ThreadTag"** — The database model is `ThreadTag` but the domain concept is simply **Tag**. The "Thread" prefix is redundant from a domain perspective since tags only apply to threads. Recommendation: keep `ThreadTag` in the DB for disambiguation but refer to the concept as **Tag** in domain language and documentation.
- **"Membership" vs "SectionMember"** — The database model is `SectionMember` (a `Section` + `User` join). In domain language this is best called **Membership** since it represents a user's membership in a thread. The "Section" prefix is a DB artifact from the Section/Thread ambiguity above.
