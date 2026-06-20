import { expect } from 'chai';
import sinon from 'sinon';
import { prisma } from '@/lib/infrastructure/prisma';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('Pagination — getThreadMessagesPaginated', function () {
  this.timeout(15000);

  let hasDb = false;
  let testUserId: string;
  let testThreadId: string;
  let messageIds: string[] = [];

  before(async function () {
    hasDb = await dbAvailable();
    if (!hasDb) {
      console.log('[FTS Search] Database unavailable — skipping integration tests');
      this.skip();
    }

    // Create test data: a user, a thread, and 120 messages
    const user = await prisma.user.upsert({
      where: { email: 'pagination-test@sastram.com' },
      create: { email: 'pagination-test@sastram.com', name: 'Pagination Test User' },
      update: {},
    });
    testUserId = user.id;

    const thread = await prisma.thread.create({
      data: {
        name: 'Pagination Test Thread',
        slug: `pagination-test-${Date.now()}`,
        description: 'Test thread for pagination',
        createdBy: testUserId,
      },
    });
    testThreadId = thread.id;

    // Create 120 messages in reverse order so createdAt desc works
    const messages = [];
    for (let i = 0; i < 120; i++) {
      messages.push({
        content: `Message ${i}`,
        threadId: testThreadId,
        senderId: testUserId,
        depth: 0,
      });
    }
    await prisma.message.createMany({ data: messages });

    const created = await prisma.message.findMany({
      where: { threadId: testThreadId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    messageIds = created.map((m) => m.id);
  });

  after(async function () {
    if (!hasDb) return;
    // Clean up test data
    await prisma.message.deleteMany({ where: { threadId: testThreadId } });
    await prisma.thread.delete({ where: { id: testThreadId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  it('returns correct totalCount', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const result = await getThreadMessagesPaginated(testThreadId, null, 50);
    expect(result.totalCount).to.equal(120);
  });

  it('returns first page with hasMore=true when more messages exist', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const result = await getThreadMessagesPaginated(testThreadId, null, 50);
    expect(result.hasMore).to.be.true;
    expect(result.nextCursor).to.be.a('string');
    expect(result.messages).to.have.lengthOf(50);
  });

  it('returns second page with hasMore=true', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const firstPage = await getThreadMessagesPaginated(testThreadId, null, 50);
    const secondPage = await getThreadMessagesPaginated(testThreadId, firstPage.nextCursor, 50);
    expect(secondPage.hasMore).to.be.true;
    expect(secondPage.messages).to.have.lengthOf(50);
    // Second page messages should be older than first page
    const firstOldest = firstPage.messages[0].createdAt;
    const secondNewest = secondPage.messages[secondPage.messages.length - 1].createdAt;
    expect(secondNewest.getTime()).to.be.lessThan(firstOldest.getTime());
  });

  it('returns last page with hasMore=false', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const firstPage = await getThreadMessagesPaginated(testThreadId, null, 50);
    const secondPage = await getThreadMessagesPaginated(testThreadId, firstPage.nextCursor, 50);
    const lastPage = await getThreadMessagesPaginated(testThreadId, secondPage.nextCursor, 50);
    expect(lastPage.hasMore).to.be.false;
    expect(lastPage.nextCursor).to.be.null;
    expect(lastPage.messages).to.have.lengthOf(20);
  });

  it('caps limit at 100', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const result = await getThreadMessagesPaginated(testThreadId, null, 500);
    expect(result.messages.length).to.be.at.most(100);
  });

  it('returns empty array for non-existent thread', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const result = await getThreadMessagesPaginated('nonexistentThreadId123', null, 50);
    expect(result.messages).to.deep.equal([]);
    expect(result.hasMore).to.be.false;
    expect(result.totalCount).to.equal(0);
  });

  it('returns messages in ascending order (oldest first)', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const result = await getThreadMessagesPaginated(testThreadId, null, 10);
    for (let i = 1; i < result.messages.length; i++) {
      expect(result.messages[i].createdAt.getTime()).to.be.greaterThanOrEqual(
        result.messages[i - 1].createdAt.getTime()
      );
    }
  });

  it('includes author info on messages', async function () {
    const { getThreadMessagesPaginated } = await import('@/modules/threads/threads-read/repository');
    const result = await getThreadMessagesPaginated(testThreadId, null, 1);
    expect(result.messages[0].author).to.have.property('id', testUserId);
    expect(result.messages[0].author).to.have.property('name', 'Pagination Test User');
  });
});
