import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession } from '@/modules/auth';
import { SearchPage } from '@/components/ai-search/SearchPage';

export const metadata: Metadata = {
  title: 'Sai Search — Sastram',
  description:
    'Search across Reddit, Hacker News, ArchWiki, Stack Overflow and more with Sai-powered synthesis.',
};

function SearchPageSkeleton() {
  return (
    <div className="flex h-screen bg-canvas">
      {/* Primary Nav Skeleton */}
      <div className="w-65 shrink-0 bg-surface border-r border-line p-4">
        <Skeleton className="h-6 w-24 mb-6" />
        <Skeleton className="h-8 w-full mb-4" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>

      {/* History Sidebar Skeleton */}
      <div className="w-75 shrink-0 border-r border-line p-4">
        <Skeleton className="h-5 w-12 mb-4" />
        <Skeleton className="h-8 w-full mb-4" />
        <Skeleton className="h-px w-full mb-4" />
        <Skeleton className="h-4 w-16 mb-2" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 p-8">
        <div className="flex items-center gap-2 mb-8">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-col items-center">
          <Skeleton className="w-32 h-32 mb-8" />
          <Skeleton className="h-8 w-80 mb-4" />
          <Skeleton className="h-4 w-96 mb-8" />
          <Skeleton className="h-4 w-64 mb-2" />
          <Skeleton className="h-4 w-72 mb-2" />
          <Skeleton className="h-4 w-60 mb-8" />
          <Skeleton className="h-12 w-full max-w-2xl rounded-card" />
        </div>
      </div>
    </div>
  );
}

export default async function AISearchPage() {
  const session = await getSession();
  const user = session?.user
    ? { name: session.user.name, email: session.user.email, image: session.user.image }
    : null;

  return (
    <ErrorBoundary>
      <Suspense fallback={<SearchPageSkeleton />}>
        <SearchPage user={user} />
      </Suspense>
    </ErrorBoundary>
  );
}
