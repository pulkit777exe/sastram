import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth, stubHeaders, restoreStubs } from './helpers';
import { FILE_LIMITS } from '@/lib/config/constants';

const POST = () => require('@/app/api/messages/route').POST;

describe('POST /api/messages', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

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

  it('returns 413 when content-length exceeds the shared upload cap', async () => {
    const formData = new FormData();
    formData.append('threadId', 'cklxy00000000000000000000');
    formData.append('content', 'hello');
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'content-length': String(FILE_LIMITS.MAX_TOTAL_UPLOAD_BYTES + 1) },
      body: formData,
    });

    const res = await POST()(req);
    const body = await res.json();
    expect(res.status).to.equal(413);
    expect(body.error?.code).to.equal('PAYLOAD_TOO_LARGE');
  });

  it('returns 400 when parsed attachments exceed the shared total cap without a content-length', async () => {
    const formData = new FormData();
    formData.append('threadId', 'cklxy00000000000000000000');
    formData.append(
      'files',
      new File([new Uint8Array(FILE_LIMITS.MAX_TOTAL_UPLOAD_BYTES + 1)], 'big.png', { type: 'image/png' })
    );
    // Chunked requests reach the route without content-length, so exercise the
    // post-parse check directly instead of relying on undici's header.
    const req = {
      headers: { get: () => null },
      formData: async () => formData,
    };

    const res = await POST()(req);
    const body = await res.json();
    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});
