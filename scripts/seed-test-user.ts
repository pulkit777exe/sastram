import { prisma } from '@/lib/infrastructure/prisma';
import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';

const TEST_EMAIL = 'test@sastram.dev';
const TEST_PASSWORD = 'TestPassword123!';

async function main() {
  const hashed = await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {
      emailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
      name: 'Test User',
    },
    create: {
      email: TEST_EMAIL,
      name: 'Test User',
      emailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
      welcomeEmailSent: true,
    },
  });

  await prisma.account.upsert({
    where: { accountId: user.id },
    update: { password: hashed },
    create: {
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: hashed,
    },
  });

  const token = randomUUID() + randomUUID().replace(/-/g, '');
  const session = await prisma.session.upsert({
    where: { token },
    update: { expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
    create: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      ipAddress: '127.0.0.1',
      userAgent: 'playwright-seed',
    },
  });

  console.log('SEEDED USER:', user.id, TEST_EMAIL);
  console.log('SEEDED SESSION_TOKEN:', session.token);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
