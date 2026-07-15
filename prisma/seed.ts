import { prisma } from '@/lib/infrastructure/prisma';
import { randomUUID } from 'crypto';

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function createThread({
  name,
  description,
  userId,
}: {
  name: string;
  description?: string;
  icon?: string;
  userId: string;
}) {
  return prisma.thread.create({
    data: {
      name,
      description,
      slug: `${slugify(name)}-${randomUUID()}`,
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
      icon: 'Brain',
    },
    {
      name: 'Sustainable Energy Solutions',
      description: 'Solar, wind, fusion, and breakthroughs in energy storage.',
      icon: 'Zap',
    },
    {
      name: 'Space Exploration 2025',
      description: 'Artemis, Starship, and human-rated mission planning.',
      icon: 'Rocket',
    },
    {
      name: 'Best Rust Web Frameworks?',
      description: 'Compare Actix, Axum, Rocket for production work.',
      icon: 'Code',
    },
    {
      name: 'Indie Hacking Tips',
      description: 'Launch week retrospectives and weeklies.',
      icon: 'Laptop',
    },
  ];

  for (const thread of threads) {
    await createThread({ ...thread, userId: user.id });
  }

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
