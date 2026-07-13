import { expect } from 'chai';
import { prisma } from '@/lib/infrastructure/prisma';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('AI inline reply — counter increments', function () {
  this.timeout(30_000);

  let hasDb = false;
  let testUserId: string;
  let testThreadId: string;
  let rootMessageId: string;

  before(async function () {
    hasDb = await dbAvailable();
    if (!hasDb) {
      this.skip();
    }

    const user = await prisma.user.upsert({
      where: { email: 'ai-counter-test@sastram.com' },
      create: { email: 'ai-counter-test@sastram.com', name: 'AI Counter Test User' },
      update: {},
    });
    testUserId = user.id;

    const thread = await prisma.thread.create({
      data: {
        name: 'AI Counter Test Thread',
        slug: `ai-counter-test-${Date.now()}`,
        description: 'Thread for testing AI counter increments',
        createdBy: testUserId,
        messageCount: 0,
        memberCount: 1,
      },
    });
    testThreadId = thread.id;

    const message = await prisma.message.create({
      data: {
        content: '@ai What is new today?',
        threadId: testThreadId,
        senderId: testUserId,
        depth: 0,
      },
    });
    rootMessageId = message.id;

    // Ensure the thread messageCount reflects the root message
    await prisma.thread.update({
      where: { id: testThreadId },
      data: { messageCount: 1 },
    });
  });

  after(async function () {
    if (!hasDb) return;
    // Clean up in FK-safe order
    await prisma.message.deleteMany({ where: { threadId: testThreadId } }).catch(() => {});
    await prisma.thread.delete({ where: { id: testThreadId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { email: 'ai@sastram.system' } }).catch(() => {});
  });

  it('increments parent replyCount and thread messageCount when AI reply is created', async function () {
    // Snapshot counters before the AI inline job runs
    const threadBefore = await prisma.thread.findUnique({
      where: { id: testThreadId },
      select: { messageCount: true },
    });
    const parentBefore = await prisma.message.findUnique({
      where: { id: rootMessageId },
      select: { replyCount: true },
    });

    expect(threadBefore?.messageCount).to.be.greaterThanOrEqual(0);
    expect(parentBefore?.replyCount).to.equal(0);

    // Exercise the actual fixed code path — handleAIInlineJob calls createAiMessage
    // inside a $transaction that bumps both counters. With no API key configured,
    // the AI service returns the NoOp sentinel, but the message + counter logic
    // still executes.
    const { handleAIInlineJob } = await import('@/lib/queue/workers/ai.worker');
    const result = await handleAIInlineJob({
      messageId: rootMessageId,
      threadId: testThreadId,
      query: 'What is new today?',
      userId: testUserId,
    });

    expect(result.queued).to.equal(true);
    expect(result.handled).to.equal(true);

    // Verify parent's replyCount incremented by 1
    const parentAfter = await prisma.message.findUnique({
      where: { id: rootMessageId },
      select: { replyCount: true },
    });
    expect(parentAfter?.replyCount).to.equal((parentBefore?.replyCount ?? 0) + 1);

    // Verify thread's messageCount incremented by 1
    const threadAfter = await prisma.thread.findUnique({
      where: { id: testThreadId },
      select: { messageCount: true },
    });
    expect(threadAfter?.messageCount).to.equal((threadBefore?.messageCount ?? 0) + 1);

    // Verify the AI message was actually created in the DB
    const aiMessage = await prisma.message.findFirst({
      where: { threadId: testThreadId, parentId: rootMessageId, isAiResponse: true },
      select: { id: true, depth: true },
    });
    expect(aiMessage).to.not.be.null;
    expect(aiMessage?.depth).to.equal(1);
  });
});
