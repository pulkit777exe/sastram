import type { ThreadSideEffectsPort, ThreadActivityRecord } from '../ports/side-effects';

interface FakeThreadSideEffectsState {
  enqueuedAiJobs: Array<{ threadId: string; message: unknown }>;
  revalidatedThreadSlugs: Array<string | null>;
  revalidatedDashboardCount: number;
  activities: ThreadActivityRecord[];
  existingSlugs: Set<string>;
  refreshedExpertiseFor: string[];
  copiedTags: Array<{ sourceThreadId: string; destThreadId: string }>;
}

function createState(): FakeThreadSideEffectsState {
  return {
    enqueuedAiJobs: [],
    revalidatedThreadSlugs: [],
    revalidatedDashboardCount: 0,
    activities: [],
    existingSlugs: new Set<string>(),
    refreshedExpertiseFor: [],
    copiedTags: [],
  };
}

export function createFakeThreadSideEffects(
  seed?: { existingSlugs?: string[] | Set<string> }
): ThreadSideEffectsPort & { state: FakeThreadSideEffectsState } {
  const state = createState();
  if (seed?.existingSlugs) {
    state.existingSlugs = new Set(seed.existingSlugs);
  }
  const port: ThreadSideEffectsPort & { state: FakeThreadSideEffectsState } = {
    state,
    async enqueueInitialAiJobs({ threadId, message }) {
      state.enqueuedAiJobs.push({ threadId, message });
    },
    revalidateThreadPage(slug) {
      state.revalidatedThreadSlugs.push(slug);
    },
    revalidateDashboard() {
      state.revalidatedDashboardCount += 1;
    },
    async recordActivity(args) {
      state.activities.push(args);
      return { id: `fake-activity-${state.activities.length}` };
    },
    async slugExists(slug) {
      return state.existingSlugs.has(slug);
    },
    refreshExpertise(userId) {
      state.refreshedExpertiseFor.push(userId);
    },
    async copyThreadTags(sourceThreadId, destThreadId) {
      state.copiedTags.push({ sourceThreadId, destThreadId });
    },
  };
  return port;
}

export const fakeThreadSideEffects = createFakeThreadSideEffects();
