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

- Missing rate limits (we are aware)
- Dependency CVEs (tracked via Dependabot)
- Self-XSS
