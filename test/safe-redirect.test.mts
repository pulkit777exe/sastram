import { describe, it } from 'mocha';
import { expect } from 'chai';
import { safeRedirectPath } from '@/lib/utils/safe-redirect';

describe('safeRedirectPath', () => {
  const rejected = [
    '//evil.com',
    '///evil.com',
    'https://evil.com',
    'http://evil.com/dashboard',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '',
  ];

  for (const candidate of rejected) {
    it(`falls back for ${JSON.stringify(candidate)}`, () => {
      expect(safeRedirectPath(candidate)).to.equal('/dashboard');
    });
  }

  it('falls back when no candidate is provided', () => {
    expect(safeRedirectPath(null)).to.equal('/dashboard');
    expect(safeRedirectPath(undefined)).to.equal('/dashboard');
  });

  it('allows same-origin paths with query and hash', () => {
    expect(safeRedirectPath('/dashboard/threads/abc?tab=summary#top')).to.equal(
      '/dashboard/threads/abc?tab=summary#top'
    );
  });

  it('normalizes dot segments without escaping the origin', () => {
    expect(safeRedirectPath('/dashboard/../login')).to.equal('/login');
  });

  it('supports a custom fallback for callers that probe for a valid path', () => {
    expect(safeRedirectPath('https://evil.com', '')).to.equal('');
    expect(safeRedirectPath('/dashboard', '')).to.equal('/dashboard');
  });
});
