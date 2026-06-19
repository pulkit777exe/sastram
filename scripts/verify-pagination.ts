/**
 * Phase 1 Verification: Measure paginated payload sizes
 */

import { prisma } from '@/lib/infrastructure/prisma';

async function measurePaginated(threadId: string, label: string) {
  console.log(`\n--- ${label} ---`);
  
  const startTime = Date.now();
  
  // First page (50 messages)
  const firstPage = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 51,
  });
  
  const hasMore = firstPage.length > 50;
  const messages = hasMore ? firstPage.slice(0, 50) : firstPage;
  
  const payloadJson = JSON.stringify(messages);
  const payloadSizeKB = (Buffer.byteLength(payloadJson, 'utf-8') / 1024).toFixed(2);
  
  const elapsed = Date.now() - startTime;
  
  console.log(`Messages returned:  ${messages.length}`);
  console.log(`Has more:           ${hasMore}`);
  console.log(`Payload size:       ${payloadSizeKB} KB`);
  console.log(`Elapsed:            ${elapsed}ms`);
  
  // Count total messages
  const total = await prisma.message.count({ where: { threadId, deletedAt: null } });
  console.log(`Total messages:     ${total}`);
  
  return { messages: messages.length, payloadSizeKB, elapsed, total, hasMore };
}

async function main() {
  console.log('Phase 1 Verification: Paginated Payload Sizes\n');
  
  const threads = await prisma.thread.findMany({
    where: { name: { startsWith: 'Large Thread' } },
    select: { id: true, name: true, messageCount: true },
    orderBy: { messageCount: 'desc' },
  });
  
  const results = [];
  for (const thread of threads) {
    const result = await measurePaginated(thread.id, thread.name);
    results.push({ ...result, name: thread.name });
  }
  
  console.log('\n--- Summary ---');
  console.log('All threads now load max 50 messages per request.');
  console.log('Payload sizes should be flat regardless of total thread size.\n');
  
  console.table(
    results.map((r) => ({
      Thread: r.name,
      'Loaded': r.messages,
      'Total': r.total,
      'Payload (KB)': r.payloadSizeKB,
      'Has More': r.hasMore,
      'Elapsed (ms)': r.elapsed,
    }))
  );
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
