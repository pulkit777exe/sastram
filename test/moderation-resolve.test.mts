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

describe('ModerationDashboard.resolveCase — FK violation fix', function () {
  this.timeout(15000);

  let hasDb = false;
  let testUserId: string;
  let reporterId: string;
  let testThreadId: string;
  let testMessageId: string;
  let testReportId: string;

  before(async function () {
    hasDb = await dbAvailable();
    if (!hasDb) {
      this.skip();
    }

    // Create test data
    const user = await prisma.user.upsert({
      where: { email: 'mod-target@sastram.com' },
      create: { email: 'mod-target@sastram.com', name: 'Moderation Target' },
      update: {},
    });
    testUserId = user.id;

    const reporter = await prisma.user.upsert({
      where: { email: 'mod-reporter@sastram.com' },
      create: { email: 'mod-reporter@sastram.com', name: 'Moderation Reporter' },
      update: {},
    });
    reporterId = reporter.id;

    const thread = await prisma.thread.create({
      data: {
        name: 'Mod Test Thread',
        slug: `mod-test-${Date.now()}`,
        description: 'Test thread for moderation',
        createdBy: testUserId,
      },
    });
    testThreadId = thread.id;

    const message = await prisma.message.create({
      data: {
        content: 'Toxic test message',
        threadId: testThreadId,
        senderId: testUserId,
        depth: 0,
      },
    });
    testMessageId = message.id;

    const report = await prisma.report.create({
      data: {
        reporterId,
        messageId: testMessageId,
        category: 'SPAM',
        details: 'Test toxic message',
      },
    });
    testReportId = report.id;
  });

  after(async function () {
    if (!hasDb) return;
    // Clean up
    await prisma.userBan.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.report.delete({ where: { id: testReportId } }).catch(() => {});
    await prisma.message.delete({ where: { id: testMessageId } }).catch(() => {});
    await prisma.thread.delete({ where: { id: testThreadId } }).catch(() => {});
    await prisma.user.delete({ where: { email: 'system@sastram.com' } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: reporterId } }).catch(() => {});
  });

  it('throws when report not found', async function () {
    const { ModerationDashboard } = await import('@/lib/services/moderation');
    const dashboard = new ModerationDashboard();
    try {
      await dashboard.resolveCase('nonexistent', 'BLOCK', 'test reason');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).to.equal('Report not found');
    }
  });

  it('BLOCK action upserts system user and creates ban', async function () {
    const { ModerationDashboard } = await import('@/lib/services/moderation');
    const dashboard = new ModerationDashboard();
    await dashboard.resolveCase(testReportId, 'BLOCK', 'Automated ban for toxicity');

    // Verify report status updated
    const report = await prisma.report.findUnique({ where: { id: testReportId } });
    expect(report?.status).to.equal('RESOLVED');

    // Verify system user exists
    const systemUser = await prisma.user.findUnique({ where: { email: 'system@sastram.com' } });
    expect(systemUser).to.not.be.null;
    expect(systemUser?.name).to.equal('System');

    // Verify ban was created with correct FK references
    const ban = await prisma.userBan.findFirst({
      where: { userId: testUserId, threadId: testThreadId },
    });
    expect(ban).to.not.be.null;
    expect(ban?.bannedBy).to.equal(systemUser!.id);
    expect(ban?.reason).to.equal('Automated ban for toxicity');
  });

  it('BLOCK action is idempotent (system user upsert does not fail)', async function () {
    // Clean up previous ban
    await prisma.userBan.deleteMany({ where: { userId: testUserId } });

    // Create a new report for a second test
    const message2 = await prisma.message.create({
      data: {
        content: 'Another toxic message',
        threadId: testThreadId,
        senderId: testUserId,
        depth: 0,
      },
    });
    const report2 = await prisma.report.create({
      data: {
        reporterId,
        messageId: message2.id,
        category: 'SPAM',
        details: 'Second toxic message',
      },
    });

    const { ModerationDashboard } = await import('@/lib/services/moderation');
    const dashboard = new ModerationDashboard();

    // Should not throw on second run
    await dashboard.resolveCase(report2.id, 'BLOCK', 'Second ban');
    const ban = await prisma.userBan.findFirst({
      where: { userId: testUserId, threadId: testThreadId },
    });
    expect(ban).to.not.be.null;

    // Clean up
    await prisma.userBan.deleteMany({ where: { userId: testUserId } });
    await prisma.report.delete({ where: { id: report2.id } });
    await prisma.message.delete({ where: { id: message2.id } });
  });

  it('ALLOW action sets status to DISMISSED', async function () {
    const { ModerationDashboard } = await import('@/lib/services/moderation');
    const dashboard = new ModerationDashboard();

    // Create a new report for ALLOW test
    const message3 = await prisma.message.create({
      data: {
        content: 'False positive message',
        threadId: testThreadId,
        senderId: testUserId,
        depth: 0,
      },
    });
    const report3 = await prisma.report.create({
      data: {
        reporterId,
        messageId: message3.id,
        category: 'SPAM',
        details: 'False positive',
      },
    });

    await dashboard.resolveCase(report3.id, 'ALLOW', 'False positive - content is safe');

    const report = await prisma.report.findUnique({ where: { id: report3.id } });
    expect(report?.status).to.equal('DISMISSED');
    expect(report?.resolution).to.equal('False positive - content is safe');

    // No ban should be created
    const ban = await prisma.userBan.findFirst({ where: { userId: testUserId } });
    expect(ban).to.be.null;

    // Clean up
    await prisma.report.delete({ where: { id: report3.id } });
    await prisma.message.delete({ where: { id: message3.id } });
  });
});
