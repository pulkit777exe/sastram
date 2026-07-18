# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public issue.

Instead, send a private report via GitHub's security advisory feature:
https://github.com/pulkit777exe/sastram/security/advisories/new

You should receive a response within 48 hours. If you don't, follow up by
pinging a maintainer on the issue tracker.

## Scope

- Authentication bypass
- SQL injection
- Cross-site scripting (XSS) in rendered content
- SSRF via AI search endpoints
- Redis/WebSocket privilege escalation
- Exposure of secrets or tokens

## Out of Scope

- Dependency CVEs (tracked via Dependabot)
- Self-XSS

## Known Limitations

Rate limiting is **best-effort**. When Upstash Redis is unavailable, the
limiter degrades to a per-serverless-instance in-memory limit (weaker than a
shared global limit) rather than failing open. This is a documented tradeoff,
not a vulnerability. See `lib/services/rate-limit.ts`.
