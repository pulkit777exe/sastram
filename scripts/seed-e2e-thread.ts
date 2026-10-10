import { prisma } from '@/lib/infrastructure/prisma';

// Fixture for test/e2e/smoke.spec.ts ("the known seeded public thread").
// Idempotent: safe to re-run. The smoke specs reference this slug directly,
// so it must exist with at least one visible message.
const TEST_EMAIL = 'test@sastram.dev';
const FIXTURE_SLUG = 'new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL }, select: { id: true } });
  if (!user) {
    console.warn('[seed-e2e-thread] test user missing — run seed-test-user.ts first');
    return;
  }

  const thread = await prisma.thread.upsert({
    where: { slug: FIXTURE_SLUG },
    update: { deletedAt: null, visibility: 'PUBLIC', name: 'new thread' },
    create: {
      name: 'new thread',
      slug: FIXTURE_SLUG,
      description: 'E2E fixture thread for smoke tests',
      visibility: 'PUBLIC',
      createdBy: user.id,
      messageCount: 1,
    },
  });

  // Exactly one seed message — delete strays so counts stay deterministic.
  await prisma.message.deleteMany({ where: { threadId: thread.id } });
  await prisma.message.create({
    data: {
      content: 'Seed message for smoke tests',
      threadId: thread.id,
      senderId: user.id,
    },
  });
  await prisma.thread.update({ where: { id: thread.id }, data: { messageCount: 1 } });

  // Probe tag for the tag-manager flow in thread-edit.spec.ts.
  // Fixed valid cuid id so the attach action passes Zod validation.
  await prisma.threadTag.upsert({
    where: { slug: 'e2eprobe' },
    update: {},
    create: {
      id: 'ce2eprobe0000000000000001',
      name: 'e2eprobe',
      slug: 'e2eprobe',
      color: '#3736fc',
    },
  });

  console.log(`SEEDED THREAD: ${thread.id} ${FIXTURE_SLUG}`);
}

main()
  .catch((e) => {
    console.error('[seed-e2e-thread] failed', e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
