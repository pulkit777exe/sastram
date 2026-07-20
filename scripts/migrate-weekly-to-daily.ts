/**
 * One-time data migration: backfill existing WEEKLY thread subscriptions to DAILY.
 *
 * Context: the digest sender (app/api/cron/daily-digest/route.ts) only emits
 * DAILY digests, so WEEKLY subscriptions silently never received email. This
 * migration flips them so no subscriber is starved. The WEEKLY option was also
 * removed from the subscribe UI (components/thread/subscribe-button.tsx) so the
 * state can no longer be (re)selected.
 *
 * Run with: tsx scripts/migrate-weekly-to-daily.ts
 */

import { prisma } from '@/lib/infrastructure/prisma';

async function main() {
  const result = await prisma.threadSubscription.updateMany({
    where: { frequency: 'WEEKLY', isActive: true },
    data: { frequency: 'DAILY' },
  });

  console.log(`[migrate-weekly-to-daily] Updated ${result.count} WEEKLY -> DAILY subscriptions.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('[migrate-weekly-to-daily] failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
