'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side wrapper so the root Server Component layout can lazy-load the
 * Radix Dialog + Select based feedback widget. `ssr: false` dynamic imports
 * are not allowed in Server Components, hence this indirection. The trigger
 * button appears once the chunk lands after hydration.
 */
export const LazyFeedbackWidget = dynamic(
  () => import('@/components/feedback/feedback-widget').then((mod) => mod.FeedbackWidget),
  { ssr: false }
);
