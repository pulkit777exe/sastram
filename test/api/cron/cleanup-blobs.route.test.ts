import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import type { NextRequest } from 'next/server';
import { mockRequest } from '../helpers';

const routeModulePath = require.resolve('@/app/api/cron/cleanup-blobs/route');
const prismaModulePath = require.resolve('@/lib/infrastructure/prisma');
const blobModulePath = require.resolve('@vercel/blob');
const cronAuthModulePath = require.resolve('@/lib/middleware/cron-auth');
const loggerModulePath = require.resolve('@/lib/infrastructure/logger');

type RouteModule = { GET: (req: NextRequest) => Promise<Response> };

interface AttachmentRow {
  id: string;
  url: string;
  messageId: string;
}

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

function loadRoute(options: {
  attachments?: AttachmentRow[];
  findMany?: sinon.SinonStub;
  del: sinon.SinonStub;
}): { GET: (req: NextRequest) => Promise<Response>; findMany: sinon.SinonStub; deleteMany: sinon.SinonStub } {
  const attachments = options.attachments ?? [];
  const findMany = options.findMany ?? sinon.stub().resolves(attachments);
  const deleteMany = sinon.stub().resolves({ count: attachments.length });

  stubModule(prismaModulePath, { prisma: { attachment: { findMany, deleteMany } } });
  stubModule(blobModulePath, { del: options.del });
  stubModule(cronAuthModulePath, { verifyCronAuth: () => null });
  stubModule(loggerModulePath, {
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
  });

  delete require.cache[routeModulePath];
  const route = require(routeModulePath) as RouteModule;
  return { GET: route.GET, findMany, deleteMany };
}

describe('GET /api/cron/cleanup-blobs', () => {
  afterEach(() => {
    delete require.cache[routeModulePath];
    delete require.cache[prismaModulePath];
    delete require.cache[blobModulePath];
    delete require.cache[cronAuthModulePath];
    delete require.cache[loggerModulePath];
  });

  it('deletes only the rows whose blob removal succeeded', async () => {
    const rows: AttachmentRow[] = [
      { id: 'att-fail', url: 'https://blob.example/fail.png', messageId: 'msg-1' },
      { id: 'att-ok', url: 'https://blob.example/ok.png', messageId: 'msg-1' },
    ];
    const del = sinon.stub();
    del.withArgs(rows[0].url).rejects(new Error('blob store unavailable'));
    del.withArgs(rows[1].url).resolves(undefined);

    const { GET, findMany, deleteMany } = loadRoute({ attachments: rows, del });
    const res = await GET(mockRequest('/api/cron/cleanup-blobs'));
    const body = await res.json();

    expect(res.status).to.equal(500);
    expect(body.error?.code).to.equal('INTERNAL_ERROR');
    sinon.assert.calledOnce(deleteMany);
    sinon.assert.calledWith(deleteMany, { where: { id: { in: ['att-ok'] } } });
    sinon.assert.calledOnce(findMany);
    sinon.assert.calledTwice(del);
  });

  it('keeps every record and returns non-200 when all blob removals fail', async () => {
    const rows: AttachmentRow[] = [{ id: 'att-1', url: 'https://blob.example/1.png', messageId: 'msg-1' }];
    const del = sinon.stub().rejects(new Error('blob store unavailable'));

    const { GET, deleteMany } = loadRoute({ attachments: rows, del });
    const res = await GET(mockRequest('/api/cron/cleanup-blobs'));
    const body = await res.json();

    expect(res.status).to.equal(500);
    expect(body.error?.code).to.equal('INTERNAL_ERROR');
    sinon.assert.notCalled(deleteMany);
  });

  it('removes records and returns 200 when every blob removal succeeds', async () => {
    const rows: AttachmentRow[] = [
      { id: 'att-1', url: 'https://blob.example/1.png', messageId: 'msg-1' },
      { id: 'att-2', url: 'https://blob.example/2.png', messageId: 'msg-1' },
    ];
    const del = sinon.stub().resolves(undefined);

    const { GET, deleteMany } = loadRoute({ attachments: rows, del });
    const res = await GET(mockRequest('/api/cron/cleanup-blobs'));
    const body = await res.json();

    expect(res.status).to.equal(200);
    expect(body.success).to.equal(true);
    expect(body.data).to.deep.equal({ deleted: 2, blobsRemoved: 2 });
    sinon.assert.calledWith(deleteMany, { where: { id: { in: ['att-1', 'att-2'] } } });
  });

  it('returns non-200 when the attachment query itself fails', async () => {
    const del = sinon.stub();
    const findMany = sinon.stub().rejects(new Error('db down'));

    const { GET } = loadRoute({ del, findMany });
    const res = await GET(mockRequest('/api/cron/cleanup-blobs'));
    const body = await res.json();

    expect(res.status).to.equal(500);
    expect(body.error?.code).to.equal('INTERNAL_ERROR');
    sinon.assert.notCalled(del);
  });
});
