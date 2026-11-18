import { describe, it } from 'mocha';
import { expect } from 'chai';
import { buildCsp } from '@/proxy';

describe('proxy CSP', () => {
  it('allows only the same-origin code-runner frame', () => {
    const csp = buildCsp('test-nonce');
    expect(csp).to.contain("frame-src 'self'");
  });

  it('disallows plugins via object-src none', () => {
    expect(buildCsp('test-nonce')).to.contain("object-src 'none'");
  });

  it('keeps clickjacking + MIME-sniffing guards', () => {
    const csp = buildCsp('test-nonce');
    expect(csp).to.contain("frame-ancestors 'none'");
    expect(csp).to.contain("base-uri 'self'");
    expect(csp).to.contain("form-action 'self'");
  });

  it('carries the request nonce in script-src', () => {
    expect(buildCsp('abc123')).to.contain("'nonce-abc123'");
  });

  it('allows Better Auth Infra identify/API hosts', () => {
    expect(buildCsp('abc123')).to.contain('https://*.better-auth.com');
  });
});
