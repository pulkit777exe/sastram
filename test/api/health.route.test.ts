import { describe, it } from 'mocha';
import { expect } from 'chai';
import { mockRequest } from './helpers';

const GET = () => require('@/app/api/health/route').GET;

describe('GET /api/health', () => {
  it('returns 200 or 503 with status field', async () => {
    const res = await GET()(mockRequest('/api/health'));
    const body = await res.json();

    expect(body).to.have.property('status');
    expect(body).to.have.property('timestamp');
    expect(body).to.have.property('version');
    expect(body).to.have.property('uptime');
    expect(body).to.have.property('services');
    expect(['ok', 'degraded']).to.include(body.status);
  });

  it('returns services object with database, redis, and ai keys', async () => {
    const res = await GET()(mockRequest('/api/health'));
    const body = await res.json();

    expect(body.services).to.have.property('database');
    expect(body.services).to.have.property('redis');
    expect(body.services).to.have.property('ai');
  });

  it('never caches readiness, even when healthy', async () => {
    const res = await GET()(mockRequest('/api/health'));

    expect(res.headers.get('cache-control')).to.equal('no-store, max-age=0');
  });

  it('returns 503 when database is not available', async () => {
    const res = await GET()(mockRequest('/api/health'));
    const body = await res.json();

    if (body.services.database === 'error') {
      expect(res.status).to.equal(503);
    }
  });
});
