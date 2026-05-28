import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth, restoreStubs } from './helpers';

const POST = () => require('@/app/api/messages/route').POST;

describe('POST /api/messages', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubAuth(null));

    const formData = new FormData();
    formData.append('threadId', 't1');
    formData.append('body', 'hello');
    const req = new Request('http://localhost:3000/api/messages', { method: 'POST', body: formData });

    const res = await POST()(req);
    const body = await res.json();
    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 400 when threadId is missing', async () => {
    const formData = new FormData();
    formData.append('body', 'hello');
    const req = new Request('http://localhost:3000/api/messages', { method: 'POST', body: formData });

    const res = await POST()(req);
    const body = await res.json();
    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });

  it('returns 400 when body and files are both missing', async () => {
    const formData = new FormData();
    formData.append('threadId', 't1');
    const req = new Request('http://localhost:3000/api/messages', { method: 'POST', body: formData });

    const res = await POST()(req);
    const body = await res.json();
    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});
