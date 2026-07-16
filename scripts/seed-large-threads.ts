import { prisma } from '@/lib/infrastructure/prisma';
import { randomUUID } from 'crypto';

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SAMPLE_MESSAGES = [
  'This is a great point about the architecture. I think we should consider the trade-offs more carefully.',
  'Has anyone benchmarked this approach? I\'m curious about the performance implications.',
  'I agree with the previous comment. The scalability concerns are real.',
  'Can we break this down into smaller pieces? The scope feels too broad.',
  'The documentation says otherwise — check the official guide.',
  'This reminds me of a similar pattern we used in production last year.',
  'What about error handling? We need to account for edge cases.',
  'The latency numbers look concerning. Has anyone profiled this?',
  'Great insight! This could significantly reduce our infrastructure costs.',
  'I\'d like to see a proof of concept before we commit to this direction.',
  'The security implications here are non-trivial. We should involve the security team.',
  'This is exactly the kind of innovation we need. Let\'s prototype it.',
  'I have concerns about the long-term maintainability of this approach.',
  'The API contract needs to be backward compatible. Breaking changes require a version bump.',
  'Could we use a feature flag for this? It would make rollout safer.',
  'The test coverage for this module is insufficient. We need integration tests.',
  'Performance regression tests should be part of the CI pipeline.',
  'The migration strategy needs more thought — we can\'t just drop columns.',
  'This aligns well with our Q3 roadmap priorities.',
  'I\'ve seen this pattern fail in production. Let\'s discuss the failure modes.',
];

const SAMPLE_REACTIONS = ['👍', '❤️', '🎯', '💡', '🔥'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomContent(): string {
  const base = randomItem(SAMPLE_MESSAGES);
  const suffix = Math.random() > 0.5 ? ` (edit ${Math.floor(Math.random() * 10)})` : '';
  return base + suffix;
}

async function main() {
  const startTime = Date.now();

  // Get or create the admin user
  const user = await prisma.user.upsert({
    where: { email: 'admin@sastram.com' },
    update: {},
    create: {
      email: 'admin@sastram.com',
      name: 'Sastram',
      image: 'https://github.com/shadcn.png',
      role: 'ADMIN',
    },
  });

  // Create a second user for variety
  const user2 = await prisma.user.upsert({
    where: { email: 'test@sastram.com' },
    update: {},
    create: {
      email: 'test@sastram.com',
      name: 'Test User',
      image: 'https://github.com/shadcn.png',
      role: 'USER',
    },
  });

  console.log(`Users ready: ${user.id}, ${user2.id}`);

  // Create 3 large threads
  const threadConfigs = [
    { name: 'Large Thread — 200 Messages', count: 200 },
    { name: 'Large Thread — 500 Messages', count: 500 },
    { name: 'Large Thread — 1000 Messages', count: 1000 },
  ];

  for (const config of threadConfigs) {
    console.log(`Creating thread: ${config.name} (${config.count} messages)...`);
    const threadStart = Date.now();

    const thread = await prisma.thread.create({
      data: {
        name: config.name,
        description: `Performance test thread with ${config.count} messages`,
        slug: `${slugify(config.name)}-${randomUUID()}`,
        createdBy: user.id,
        memberCount: 2,
      },
    });

    // Batch insert messages (50 at a time for efficiency)
    const batchSize = 50;
    const messageIds: string[] = [];

    for (let i = 0; i < config.count; i += batchSize) {
      const batch = [];
      const end = Math.min(i + batchSize, config.count);

      for (let j = i; j < end; j++) {
        const senderId = j % 3 === 0 ? user2.id : user.id;
        batch.push({
          content: randomContent(),
          threadId: thread.id,
          senderId,
          depth: 0,
          createdAt: new Date(Date.now() - (config.count - j) * 60000), // 1 min apart
        });
      }

      const created = await prisma.message.createMany({ data: batch });
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${created.count} messages`);

      // Get IDs for reaction attachment
      const msgs = await prisma.message.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'asc' },
        skip: i,
        take: end - i,
        select: { id: true },
      });
      messageIds.push(...msgs.map(m => m.id));
    }

    // Add reactions to ~30% of messages
    const reactionCount = Math.floor(config.count * 0.3);
    const reactionBatch = [];
    for (let i = 0; i < reactionCount; i++) {
      const msgId = messageIds[Math.floor(Math.random() * messageIds.length)];
      const emoji = randomItem(SAMPLE_REACTIONS);
      const reactorId = Math.random() > 0.5 ? user.id : user2.id;
      reactionBatch.push({
        messageId: msgId,
        userId: reactorId,
        emoji,
      });
    }

    // Deduplicate (unique constraint on messageId+userId+emoji)
    const uniqueReactions = reactionBatch.filter((r, i, arr) =>
      arr.findIndex(x => x.messageId === r.messageId && x.userId === r.userId && x.emoji === r.emoji) === i
    );

    if (uniqueReactions.length > 0) {
      await prisma.reaction.createMany({
        data: uniqueReactions,
        skipDuplicates: true,
      });
      console.log(`  Added ${uniqueReactions.length} reactions`);
    }

    // Update thread messageCount
    await prisma.thread.update({
      where: { id: thread.id },
      data: { messageCount: config.count, memberCount: 2 },
    });

    const elapsed = Date.now() - threadStart;
    console.log(`  Thread created in ${elapsed}ms — slug: ${thread.slug}`);
  }

  const totalElapsed = Date.now() - startTime;
  console.log(`\nSeeding completed in ${totalElapsed}ms`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
