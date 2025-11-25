import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createThread({
  name,
  description,
  icon,
  userId,
  communityId,
}: {
  name: string;
  description?: string;
  icon?: string;
  userId: string;
  communityId?: string;
}) {
  return prisma.section.create({
    data: {
      name,
      description,
      icon,
      slug: `${slugify(name)}-${randomUUID()}`,
      createdBy: userId,
      communityId,
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
    where: { email: "test@example.com" },
    update: {},
    create: {
      email: "test@example.com",
      name: "Test User",
      image: "https://github.com/shadcn.png",
      role: "ADMIN",
    },
  });

  const researchCommunity = await prisma.community.create({
    data: {
      title: "Research Lab",
      description: "Long-form exploration into AGI alignment and governance.",
      slug: `${slugify("Research Lab")}-${randomUUID()}`,
      createdBy: user.id,
    },
  });

  const builderCommunity = await prisma.community.create({
    data: {
      title: "Indie Builders",
      description: "Shipping stories, growth experiments, indie accountability.",
      slug: `${slugify("Indie Builders")}-${randomUUID()}`,
      createdBy: user.id,
    },
  });

  const threads = [
    {
      name: "Artificial Intelligence & Ethics",
      description: "Discuss ethical implications of AGI and LLM deployments.",
      icon: "Brain",
      communityId: researchCommunity.id,
    },
    {
      name: "Sustainable Energy Solutions",
      description: "Solar, wind, fusion, and breakthroughs in energy storage.",
      icon: "Zap",
      communityId: researchCommunity.id,
    },
    {
      name: "Space Exploration 2025",
      description: "Artemis, Starship, and human-rated mission planning.",
      icon: "Rocket",
      communityId: researchCommunity.id,
    },
    {
      name: "Best Rust Web Frameworks?",
      description: "Compare Actix, Axum, Rocket for production work.",
      icon: "Code",
      communityId: builderCommunity.id,
    },
    {
      name: "Indie Hacking Tips",
      description: "Launch week retrospectives and weeklies.",
      icon: "Laptop",
      communityId: builderCommunity.id,
    },
  ];

  for (const thread of threads) {
    await createThread({ ...thread, userId: user.id });
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
