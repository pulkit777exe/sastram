import { describe, it } from 'mocha';
import { expect } from 'chai';
import { GET } from '@/app/api/health/live/route';

describe('GET /api/health/live', () => {
  it('returns 200 without touching the database or any configured service', async () => {
    const res = GET();
    const body = await res.json();

    expect(res.status).to.equal(200);
    expect(body.status).to.equal('ok');
    expect(body.uptime).to.be.a('number');
    expect(body.services).to.equal(undefined);
  });

  it('is never cached', () => {
    const res = GET();
    expect(res.headers.get('cache-control')).to.equal('no-store, max-age=0');
  });
});
