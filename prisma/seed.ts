import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      email: "test@example.com",
      name: "Test User",
      image: "https://github.com/shadcn.png",
      role: "ADMIN",
    },
  });

  console.log({ user });

  const majorTopics = [
    {
      name: "Artificial Intelligence & Ethics",
      description: "Discussing the ethical implications of AGI and LLMs in modern society.",
      icon: "Brain",
    },
    {
      name: "Sustainable Energy Solutions",
      description: "Exploring new technologies in solar, wind, and fusion energy.",
      icon: "Zap",
    },
    {
      name: "Space Exploration 2025",
      description: "Updates on Artemis missions, SpaceX Starship, and Mars colonization plans.",
      icon: "Rocket",
    },
  ];

  for (const topic of majorTopics) {
    await prisma.section.create({
      data: {
        ...topic,
        createdBy: user.id,
        messages: {
          create: [
            {
              content: "Welcome to the discussion on " + topic.name,
              senderId: user.id,
            },
            {
              content: "What are your thoughts on the latest developments?",
              senderId: user.id,
            },
          ],
        },
      },
    });
  }

  const smallThreads = [
    {
      name: "Best Rust Web Frameworks?",
      description: "Comparing Actix-web, Axum, and Rocket for production use.",
      icon: "Code",
    },
    {
      name: "Indie Hacking Tips",
      description: "Sharing strategies for launching your first SaaS product.",
      icon: "Laptop",
    },
  ];

  for (const thread of smallThreads) {
    await prisma.section.create({
      data: {
        ...thread,
        createdBy: user.id,
        messages: {
          create: [
            {
              content: "I personally prefer Axum for its ergonomics.",
              senderId: user.id,
            },
          ],
        },
      },
    });
  }

  console.log("Seeding completed.");
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
