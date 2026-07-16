import { describe, it } from 'mocha';
import { expect } from 'chai';
import { generateRequestId, scrub, safeContext } from '../lib/infrastructure/logger';

describe('Logger', () => {
  describe('generateRequestId', () => {
    it('should generate a string starting with req_', () => {
      const id = generateRequestId();
      expect(id).to.be.a('string');
      expect(id.startsWith('req_')).to.be.true;
    });

    it('should produce unique values across calls', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).to.equal(100);
    });

    it('should produce consistent length', () => {
      const ids = Array.from({ length: 10 }, () => generateRequestId());
      const length = ids[0].length;
      ids.forEach((id) => expect(id.length).to.equal(length));
    });
  });

  describe('scrub — secret key redaction', () => {
    it('redacts object values whose keys match secret patterns', () => {
      const out = scrub({
        apiKey: 'sk_live_12345',
        password: 'hunter2',
        token: 'abc.def.ghi',
        user: 'bob',
      }) as Record<string, unknown>;
      expect(out.apiKey).to.equal('[REDACTED]');
      expect(out.password).to.equal('[REDACTED]');
      expect(out.token).to.equal('[REDACTED]');
      expect(out.user).to.equal('bob');
    });

    it('redacts nested secret keys', () => {
      const out = scrub({ auth: { secret: 'topsecret', ok: 1 } }) as Record<string, unknown>;
      expect((out.auth as Record<string, unknown>).secret).to.equal('[REDACTED]');
      expect((out.auth as Record<string, unknown>).ok).to.equal(1);
    });

    it('redacts case-insensitive secret keys', () => {
      const out = scrub({ API_KEY: 'x', Authorization: 'y' }) as Record<string, unknown>;
      expect(out.API_KEY).to.equal('[REDACTED]');
      expect(out.Authorization).to.equal('[REDACTED]');
    });

    it('preserves metadata objects untouched', () => {
      const meta = { nested: { token: 'leak' } };
      const out = scrub({ metadata: meta }) as Record<string, unknown>;
      expect(out.metadata).to.deep.equal(meta);
    });
  });

  describe('scrub — JWT / opaque string redaction', () => {
    it('redacts JWT-like strings', () => {
      const jwt = 'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc';
      const out = scrub(jwt);
      expect(out).to.equal('[REDACTED]');
    });

    it('leaves ordinary strings intact', () => {
      expect(scrub('hello world')).to.equal('hello world');
    });
  });

  describe('scrub — Bearer token redaction', () => {
    it('redacts Bearer tokens inside free-form text', () => {
      const out = scrub('Authorization: Bearer abc123XYZ.tokenhere') as string;
      expect(out).to.equal('Authorization: Bearer [REDACTED]');
    });
  });

  describe('scrub — email masking', () => {
    it('masks the local part of an email', () => {
      expect(scrub('jane.doe@example.com')).to.equal('j*******@example.com');
    });

    it('does not alter non-email strings', () => {
      expect(scrub('no email here')).to.equal('no email here');
    });
  });

  describe('scrub — circular references', () => {
    it('replaces circular references with [Circular]', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      const out = scrub(obj) as Record<string, unknown>;
      expect(out.self).to.equal('[Circular]');
    });
  });

  describe('scrub — arrays', () => {
    it('recurses into array elements', () => {
      const out = scrub([{ password: 'x' }, 'Bearer tok12345678']) as unknown[];
      expect((out[0] as Record<string, unknown>).password).to.equal('[REDACTED]');
      expect(out[1]).to.equal('Bearer [REDACTED]');
    });
  });

  describe('safeContext', () => {
    it('returns empty object when no args provided', () => {
      expect(safeContext([])).to.deep.equal({});
    });

    it('merges and scrubs object args', () => {
      const out = safeContext([{ email: 'a@b.com' }, { apiKey: 's' }]) as Record<string, unknown>;
      expect(out.apiKey).to.equal('[REDACTED]');
      expect(out.email).to.equal('a*@b.com');
    });
  });
});

