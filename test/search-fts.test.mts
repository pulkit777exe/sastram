import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { prisma } from '@/lib/infrastructure/prisma';
import { searchThreads, searchMessages } from '@/modules/search/repository';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('FTS Search with GIN indexes', () => {
  let dbOk = false;
  const testId = `test-${Date.now()}`;
  let testThreadId: string;
  let testUserId: string;

  before(async function () {
    dbOk = await dbAvailable();
    if (!dbOk) {
      console.warn('[FTS Search] Database unavailable — skipping integration tests');
      this.skip();
      return;
    }

    testUserId = `user-${testId}`;
    testThreadId = `thread-${testId}`;

    await prisma.$executeRaw`
      INSERT INTO "users" ("id", "email", "name")
      VALUES (${testUserId}, ${`${testId}@test.com`}, 'Test User')
      ON CONFLICT ("id") DO NOTHING
    `;

    await prisma.$executeRaw`
      INSERT INTO "threads" ("id", "name", "slug", "description", "createdBy")
      VALUES (${testThreadId}, 'Docker Networking Guide', ${`${testId}-docker`}, 'How to configure Docker networks and bridge mode', ${testUserId})
      ON CONFLICT ("id") DO NOTHING
    `;

    await prisma.$executeRaw`
      INSERT INTO "messages" ("id", "content", "threadId", "senderId")
      VALUES (${`msg-${testId}`}, 'Docker containers communicate through bridge networks', ${testThreadId}, ${testUserId})
      ON CONFLICT ("id") DO NOTHING
    `;
  });

  it('should search threads using fts_vector column', async function () {
    if (!dbOk) this.skip();
    const result = await searchThreads('docker networking');
    expect(result.threads.length).to.be.greaterThan(0);
    const match = result.threads.find((t) => t.id === testThreadId);
    expect(match).to.not.be.undefined;
    expect(match!.name).to.equal('Docker Networking Guide');
  });

  it('should search messages using fts_vector column', async function () {
    if (!dbOk) this.skip();
    const result = await searchMessages('bridge networks');
    expect(result.messages.length).to.be.greaterThan(0);
    const match = result.messages.find((m) => m.id === `msg-${testId}`);
    expect(match).to.not.be.undefined;
    expect(match!.content).to.include('bridge networks');
  });

  it('should return empty for non-matching query', async function () {
    if (!dbOk) this.skip();
    const [threadResult, messageResult] = await Promise.all([
      searchThreads('xyznonexistentzzz'),
      searchMessages('xyznonexistentzzz'),
    ]);
    expect(threadResult.threads.length).to.equal(0);
    expect(messageResult.messages.length).to.equal(0);
  });

  after(async () => {
    if (!dbOk) return;
    await prisma.$executeRaw`DELETE FROM "messages" WHERE "id" = ${`msg-${testId}`}`;
    await prisma.$executeRaw`DELETE FROM "threads" WHERE "id" = ${testThreadId}`;
    await prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ${testUserId}`;
  });
});
