import { prisma } from '@/lib/infrastructure/prisma';
import { buildThreadSlug } from '@/modules/threads/slug';

type DemoThreadSeed = {
  stableId: string;
  name: string;
  description: string;
};

async function ensureDemoThread(seed: DemoThreadSeed, userId: string) {
  const slug = buildThreadSlug(seed.name, seed.stableId);
  const welcomeContent = `Welcome to ${seed.name}`;

  const thread = await prisma.thread.upsert({
    where: { slug },
    update: {
      deletedAt: null,
      visibility: 'PUBLIC',
      name: seed.name,
      description: seed.description,
      createdBy: userId,
    },
    create: {
      name: seed.name,
      slug,
      description: seed.description,
      visibility: 'PUBLIC',
      createdBy: userId,
      messages: {
        create: [
          {
            content: welcomeContent,
            senderId: userId,
          },
        ],
      },
    },
    select: { id: true },
  });

  const welcome = await prisma.message.findFirst({
    where: { threadId: thread.id, senderId: userId, content: welcomeContent },
    select: { id: true },
  });
  if (!welcome) {
    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: userId,
        content: welcomeContent,
      },
    });
  }

  return thread;
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

  const threads: DemoThreadSeed[] = [
    {
      stableId: 'seed-demo-ai-ethics',
      name: 'Artificial Intelligence & Ethics',
      description: 'Discuss ethical implications of AGI and LLM deployments.',
    },
    {
      stableId: 'seed-demo-sustainable-energy',
      name: 'Sustainable Energy Solutions',
      description: 'Solar, wind, fusion, and breakthroughs in energy storage.',
    },
    {
      stableId: 'seed-demo-space-exploration',
      name: 'Space Exploration 2025',
      description: 'Artemis, Starship, and human-rated mission planning.',
    },
    {
      stableId: 'seed-demo-rust-web-frameworks',
      name: 'Best Rust Web Frameworks?',
      description: 'Compare Actix, Axum, Rocket for production work.',
    },
    {
      stableId: 'seed-demo-indie-hacking',
      name: 'Indie Hacking Tips',
      description: 'Launch week retrospectives and weeklies.',
    },
  ];

  for (const thread of threads) {
    await ensureDemoThread(thread, user.id);
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
