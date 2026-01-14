import { prisma } from "@/lib/infrastructure/prisma";

export async function seedSafetyRules() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!admin) {
    throw new Error("No admin user found to assign as rule creator");
  }

  const rules = [
    {
      pattern: "\\b(spam|junk)\\b",
      category: "spam",
      severity: "HIGH",
      action: "BLOCK",
    },
    {
      pattern: "\\b(hate|discrimination)\\b",
      category: "harassment",
      severity: "HIGH",
      action: "BLOCK",
    },
  ];

  for (const rule of rules) {
    await prisma.contentSafetyRule.upsert({
      where: {
        pattern_category: {
          pattern: rule.pattern,
          category: rule.category,
        } as any,
      },
      update: {},
      create: {
        pattern: rule.pattern,
        category: rule.category,
        severity: rule.severity as any,
        action: rule.action as any,
        createdBy: admin.id,
      },
    });
  }
}

if (require.main === module) {
  seedSafetyRules()
    .then(() => {
      console.log("Seeded content safety rules");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

