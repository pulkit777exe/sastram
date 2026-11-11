# Security Policy

## Supported Versions

Only the latest release on `main` receives security fixes. Older commits, tags, and forks are unsupported.

| Version | Supported |
| ------- | --------- |
| `0.1.x` (current `main`) | ✅ |
| Older than `0.1` | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public issue.

Preferred: open a private GitHub security advisory:
https://github.com/pulkit777exe/sastram/security/advisories/new

Fallback: email [security@sastram.wtfpulkit.dev](mailto:security@sastram.wtfpulkit.dev). If you use email, include reproduction steps and affected endpoints/versions, and avoid attaching live secrets or personal data.

### Disclosure timeline

- **Acknowledgement**: within 48 hours.
- **Triage**: within 5 business days, with a severity assessment and whether the report is in scope.
- **Fix or mitigation**: target 30 days for critical/high findings and 90 days for medium/low findings. Complex issues may take longer; we will share a revised timeline rather than silently miss the target.
- **Coordinated disclosure**: we ask that you keep the report private until a fix or mitigation is released, or until 90 days have passed since acknowledgement, whichever comes first. We will credit reporters unless you ask to remain anonymous.

If you do not receive an acknowledgement within 48 hours, follow up at the fallback email above.

## Scope

- Authentication bypass or session fixation
- SQL injection via Prisma queries
- Cross-site scripting (XSS) in rendered content
- SSRF via AI search or link-preview endpoints
- Redis privilege escalation or cache poisoning
- Exposure of secrets or tokens
- Authorization bypass in thread access controls
- Code Runner sandbox escape, or execution of untrusted code outside the sandboxed iframe (`allow-scripts`, opaque origin, `connect-src 'none'`)
- Privacy bypasses that expose private/followers-only profiles or private thread content

## Out of Scope

- Dependency CVEs already blocked by `bun run audit:gate`; report a specific exploitable path if the gate misses it
- Rate limiting circumvention (see Known Limitations)
- Reports that require a user to paste attacker-supplied code into DevTools on their own machine, unless the app itself instructs them to do so

## Security Measures

### Thread Access Control

Authorization is enforced via `lib/thread-access.ts`. Thread visibility follows these rules:

- **Public threads**: readable by anyone; writes require a session
- **Private/Restricted threads**: creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN

All API routes and server actions must call `requireReadOrThrow` (reads) or `requireWriteOrThrow` (writes) before accessing thread data.

### AI Spend Cap

Daily AI spend is capped at $5.00 via Redis `INCRBYFLOAT`. See `lib/services/ai-spend-cap.ts`.

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
