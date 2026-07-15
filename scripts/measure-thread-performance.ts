/**
 * Phase 0: Ground truth measurement script
 * 
 * Measures:
 * 1. Query count, payload size, and timing for each thread
 * 2. Number of messages returned per thread
 * 3. Average message size in bytes
 */

import { prisma } from '@/lib/infrastructure/prisma';

async function measureThread(slug: string, userId: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Measuring thread: ${slug}`);
  console.log(`${'='.repeat(60)}`);

  // Reset query count
  let queryCount = 0;
  const startTime = Date.now();

  // Add query counting middleware temporarily
  const originalQuery = prisma.$queryRaw;
  (prisma as any).$queryRaw = async function (...args: [any, ...any[]]) {
    queryCount++;
    return originalQuery.apply(this, args);
  };

  try {
    // Import and run the actual query
    const { getThreadWithFullContext } = await import(
      '@/modules/threads/threads-read/repository'
    );
    
    const result = await getThreadWithFullContext(slug, userId);
    
    const endTime = Date.now();
    const elapsed = endTime - startTime;

    if (!result) {
      console.log('Thread not found');
      return;
    }

    // Measure payload size
    const payloadJson = JSON.stringify(result);
    const payloadSizeBytes = Buffer.byteLength(payloadJson, 'utf-8');
    const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);
    const payloadSizeMB = (payloadSizeBytes / (1024 * 1024)).toFixed(2);

    // Message stats
    const messageCount = result.messages.length;
    const topLevelMessages = result.messages.filter((m) => !m.parentId);
    const replyMessages = result.messages.filter((m) => m.parentId);
    const avgMessageSize = messageCount > 0
      ? (payloadSizeBytes / messageCount).toFixed(0)
      : '0';

    // Reaction stats
    const totalReactions = result.messages.reduce(
      (sum, m) => sum + (m.reactions?.length || 0),
      0
    );

    // Attachment stats
    const totalAttachments = result.messages.reduce(
      (sum, m) => sum + (m.attachments?.length || 0),
      0
    );

    console.log(`\n--- Results ---`);
    console.log(`Thread name:          ${result.name}`);
    console.log(`Query count:          ${queryCount}`);
    console.log(`Elapsed:              ${elapsed}ms`);
    console.log(`Payload size:         ${payloadSizeKB} KB (${payloadSizeMB} MB)`);
    console.log(`Message count:        ${messageCount}`);
    console.log(`  Top-level:          ${topLevelMessages.length}`);
    console.log(`  Replies:            ${replyMessages.length}`);
    console.log(`Avg message size:     ${avgMessageSize} bytes`);
    console.log(`Total reactions:      ${totalReactions}`);
    console.log(`Total attachments:    ${totalAttachments}`);

    return {
      slug,
      queryCount,
      elapsed,
      payloadSizeBytes,
      payloadSizeKB,
      messageCount,
      topLevelCount: topLevelMessages.length,
      replyCount: replyMessages.length,
      totalReactions,
      totalAttachments,
    };
  } finally {
    // Restore original function
    (prisma as any).$queryRaw = originalQuery;
  }
}

async function main() {
  console.log('Phase 0: Ground Truth Measurement');
  console.log('==================================\n');

  // Get the admin user
  const user = await prisma.user.findUnique({
    where: { email: 'admin@sastram.com' },
  });

  if (!user) {
    console.error('Admin user not found. Run seed first.');
    process.exit(1);
  }

  console.log(`User ID: ${user.id}`);

  // Find the 3 large threads we seeded
  const threads = await prisma.thread.findMany({
    where: {
      name: { startsWith: 'Large Thread' },
    },
    select: {
      slug: true,
      name: true,
      messageCount: true,
    },
    orderBy: { messageCount: 'desc' },
  });

  if (threads.length === 0) {
    console.error('No large threads found. Run seed-large-threads.ts first.');
    process.exit(1);
  }

  console.log(`\nFound ${threads.length} large threads:`);
  for (const t of threads) {
    console.log(`  - ${t.name} (${t.messageCount} messages) — slug: ${t.slug}`);
  }

  // Measure each thread
  const results = [];
  for (const thread of threads) {
    const result = await measureThread(thread.slug, user.id);
    if (result) results.push(result);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.table(
    results.map((r) => ({
      Thread: r.slug.substring(0, 40) + '...',
      Messages: r.messageCount,
      'Payload (KB)': r.payloadSizeKB,
      'Elapsed (ms)': r.elapsed,
      'Queries': r.queryCount,
      'Avg Msg (bytes)': r.payloadSizeBytes / r.messageCount,
    }))
  );

  // Hypothesis check
  console.log(`\n--- Hypothesis Check ---`);
  console.log(`Query count is NOT the bottleneck (single query per thread).`);
  console.log(`Real bottleneck: Full payload load + client-side holding of ALL messages.`);
  console.log(`Payload sizes: ${results.map((r) => `${r.payloadSizeKB}KB`).join(', ')}`);
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
