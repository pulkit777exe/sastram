# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public issue.

Send a private report via GitHub's security advisory feature:
https://github.com/pulkit777exe/sastram/security/advisories/new

You should receive a response within 48 hours. If you don't, follow up by pinging a maintainer on the issue tracker.

## Scope

- Authentication bypass or session fixation
- SQL injection via Prisma queries
- Cross-site scripting (XSS) in rendered content
- SSRF via AI search endpoints
- Redis privilege escalation or cache poisoning
- Exposure of secrets or tokens
- Authorization bypass in thread access controls

## Out of Scope

- Dependency CVEs (tracked via Dependabot)
- Self-XSS (requires user to paste code into their own browser)
- Rate limiting circumvention (see Known Limitations)

## Security Measures

### Thread Access Control

Authorization is enforced via `modules/threads/access.ts`. Thread visibility follows these rules:

- **Public threads**: readable by anyone; writes require a session
- **Private/Restricted threads**: creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN

All API routes and server actions must call `requireThreadAccessOrThrow` (reads) or `requireThreadWriteOrThrow` (writes) before accessing thread data.

### AI Spend Cap

Daily AI spend is capped at $5.00 via Redis `INCRBYFLOAT`. See `lib/ai/spend-cap.ts`.

### Rate Limiting

Redis-based rate limiting with in-memory fallback. Configured per-bucket (auth, messages, AI, etc.) in `lib/services/rate-limit.ts`.

### Daily Quotas

Per-user daily quotas for AI inline, AI analysis, AI search, and image moderation via Redis. See `lib/services/daily-quota.ts`.

### Content Moderation

Regex-based content filtering with optional AI inline moderation. See `lib/services/moderation.ts`.

### Input Validation

All user input validated via Zod schemas. Server actions use `createServerAction` which validates before execution.

## Known Limitations

Rate limiting is **best-effort**. When Redis is unavailable, the limiter degrades to a per-serverless-instance in-memory limit (weaker than a shared global limit) rather than failing open. This is a documented tradeoff, not a vulnerability.
