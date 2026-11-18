import { prisma } from '@/lib/infrastructure/prisma';
import { buildThreadSlug } from '@/modules/threads/slug';

// Idempotent first-run starters for the ask → AI synthesis/discussion →
// verification loop. Threads and seed messages are framed to invite
// claim-by-claim verification and evidence; they do not assert human-verified
// truth, set verifiedAt, fabricate resolution scores, or create Claim/ClaimVote
// rows.

type VerificationStarter = {
  stableId: string;
  name: string;
  description: string;
  messages: string[];
};

const STARTERS: VerificationStarter[] = [
  {
    stableId: 'seed-verify-adult-sleep',
    name: 'How much sleep do most adults need?',
    description:
      'Invite evidence and claim-by-claim verification on sleep duration, health outcomes, and individual variation.',
    messages: [
      'Question: How much sleep do most adults need, and what evidence supports that range?\n\nThis thread is a starter for the ask → synthesis/discussion → verification loop. Add sources, challenge assumptions, and verify claims individually rather than treating any single answer as settled truth.',
      'Draft answer to verify (not human-verified):\n- Many health organizations recommend roughly 7+ hours of sleep per night for most adults, but needs vary by person, age, and health context.\n- Short sleep is often associated with worse mood, attention, and cardiometabolic outcomes in observational research, while causation and thresholds can differ by study.\n- Sleep quality, regularity, and untreated sleep disorders may matter as much as duration alone.\n\nHelp verify: Which claims are well-supported? What high-quality sources confirm, nuance, or dispute each point? Please cite evidence for specific claims.',
    ],
  },
  {
    stableId: 'seed-verify-heat-pumps',
    name: 'Do heat pumps usually lower home heating emissions?',
    description:
      'A verification starter on home energy claims where grid mix, building efficiency, and assumptions matter.',
    messages: [
      'Question: In what situations do heat pumps lower home heating emissions compared with fossil-fuel heating, and where might that be uncertain?\n\nUse this thread to compare sources, test assumptions, and verify claims with local/grid-specific evidence.',
      'Draft answer to verify (not human-verified):\n- Heat pumps can deliver more useful heat per unit of input energy than combustion systems, which often gives them an efficiency advantage.\n- Whether emissions fall depends on factors like electricity grid carbon intensity, the fuel being replaced, climate, equipment efficiency, and building insulation.\n- Upfront installation quality and real-world performance data can change outcomes versus modeled estimates.\n\nHelp verify: What studies, utility data, or lifecycle analyses support or limit each claim? Which details are missing for a confident comparison?',
    ],
  },
  {
    stableId: 'seed-verify-ev-lifecycle',
    name: 'Are electric vehicles lower-emission over their full lifecycle?',
    description:
      'Invite claim-by-claim checks of manufacturing, electricity, mileage, and end-of-life assumptions.',
    messages: [
      'Question: Are electric vehicles typically lower-emission over their full lifecycle than comparable gasoline vehicles?\n\nThis starter is meant for evidence gathering and verification. Break the answer into claims and evaluate each with transparent assumptions.',
      'Draft answer to verify (not human-verified):\n- EV manufacturing, especially battery production, can create higher upfront emissions than manufacturing a comparable gasoline vehicle in many analyses.\n- Over driving life, EVs may offset that upfront footprint where electricity is lower-carbon and/or vehicles are driven enough, but results vary by region and model.\n- Battery longevity, recycling, charging patterns, and vehicle size can materially affect lifecycle comparisons.\n\nHelp verify: Which lifecycle assessments are most relevant? What assumptions drive the conclusions, and where do sources disagree?',
    ],
  },
  {
    stableId: 'seed-verify-nutrition-studies',
    name: 'What makes a nutrition study trustworthy?',
    description:
      'A neutral starter for verifying health and nutrition claims, study design, and evidence quality.',
    messages: [
      'Question: What should readers check before trusting a nutrition or diet study headline?\n\nPlease use this thread to verify criteria claim by claim and add examples of strong vs. weak evidence practices.',
      'Draft answer to verify (not human-verified):\n- Study design matters: randomized trials, cohort studies, and mechanistic research answer different questions and have different limitations.\n- Sample size, confounders, outcome measures, and whether results were replicated can affect how much confidence a claim deserves.\n- Funding, conflicts of interest, and how a study is reported in media do not automatically invalidate results, but they are relevant context to examine.\n\nHelp verify: Which checks are most reliable in practice? Can you cite sources or examples that support, refine, or dispute each point?',
    ],
  },
];

async function ensureStarter(starter: VerificationStarter, userId: string) {
  const slug = buildThreadSlug(starter.name, starter.stableId);

  const thread = await prisma.thread.upsert({
    where: { slug },
    update: {
      deletedAt: null,
      visibility: 'PUBLIC',
      name: starter.name,
      description: starter.description,
      createdBy: userId,
    },
    create: {
      name: starter.name,
      slug,
      description: starter.description,
      visibility: 'PUBLIC',
      createdBy: userId,
    },
    select: { id: true },
  });

  for (const content of starter.messages) {
    const existing = await prisma.message.findFirst({
      where: { threadId: thread.id, senderId: userId, content },
      select: { id: true },
    });
    if (!existing) {
      await prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: userId,
          content,
        },
      });
    }
  }

  return { id: thread.id, slug };
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

  for (const starter of STARTERS) {
    const thread = await ensureStarter(starter, user.id);
    console.log(`SEEDED VERIFICATION STARTER: ${thread.slug}`);
  }

  console.log('Verification starter seeding completed.');
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
