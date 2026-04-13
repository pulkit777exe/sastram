import { prisma } from "@/lib/infrastructure/prisma";

export async function seedSafetyRules() {
  // ContentSafetyRule model, ModerationSeverity, and ModerationAction have been removed
  // This is now a no-op
  console.log("Content safety rules seeding is disabled");
}

if (require.main === module) {
  seedSafetyRules()
    .then(() => {
      console.log("Seeded content safety rules (no-op)");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
