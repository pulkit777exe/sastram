import { prisma } from '@/lib/infrastructure/prisma';
import { buildThreadSlug } from '@/modules/threads/slug';

async function createThread({ name, description, userId }: { name: string; description?: string; userId: string }) {
  return prisma.thread.create({
    data: {
      name,
      description,
      // Single slug seam (modules/threads/slug): previously a cloned slugify
      // lived here and drifted. NOTE: Thread has no `icon` column — do not
      // re-add per-thread icon data to the seed rows below.
      slug: buildThreadSlug(name),
      createdBy: userId,
      messages: {
        create: [
          {
            content: `Welcome to ${name}`,
            senderId: userId,
          },
        ],
      },
    },
  });
}

async function main() {
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

  const threads = [
    {
      name: 'Artificial Intelligence & Ethics',
      description: 'Discuss ethical implications of AGI and LLM deployments.',
    },
    {
      name: 'Sustainable Energy Solutions',
      description: 'Solar, wind, fusion, and breakthroughs in energy storage.',
    },
    {
      name: 'Space Exploration 2025',
      description: 'Artemis, Starship, and human-rated mission planning.',
    },
    {
      name: 'Best Rust Web Frameworks?',
      description: 'Compare Actix, Axum, Rocket for production work.',
    },
    {
      name: 'Indie Hacking Tips',
      description: 'Launch week retrospectives and weeklies.',
    },
  ];

  for (const thread of threads) {
    await createThread({ ...thread, userId: user.id });
  }

  // System user for anonymous AI search cache sessions
  await prisma.user.upsert({
    where: { email: 'system@sastram.internal' },
    update: {},
    create: {
      id: 'anonymous',
      email: 'system@sastram.internal',
      name: 'System',
      role: 'USER',
    },
  });

  console.log('Seeding completed.');
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
