import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession } from '@/modules/auth';
import { SearchPage } from '@/components/ai-search/SearchPage';

export const metadata: Metadata = {
  title: 'Sai Search — Sastram',
  description: 'Search with AI-powered synthesis.',
};

function SearchPageSkeleton() {
  return (
    <div className="flex h-full w-full bg-background">
      <div className="w-64 shrink-0 border-r border-line bg-surface p-4">
        <Skeleton className="h-6 w-24 mb-6" />
        <Skeleton className="h-9 w-full mb-4" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="w-72 shrink-0 border-r border-line bg-surface/50 p-4">
        <Skeleton className="h-5 w-16 mb-4" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="flex-1 p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
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
