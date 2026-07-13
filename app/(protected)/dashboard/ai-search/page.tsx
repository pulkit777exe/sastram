import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchPage } from '@/components/ai-search/SearchPage';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Search — Sastram',
  description:
    'Search across Reddit, Hacker News, ArchWiki, Stack Overflow and more with AI-powered synthesis.',
};

function SearchPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-10 flex-1 max-w-xl" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-1/3" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AISearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em] mb-2">
          <Search size={14} />
          <span>AI Search</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Search with AI</h1>
        <p className="text-muted-foreground mt-2">
          Search across Reddit, Hacker News, ArchWiki, Stack Overflow and more.
        </p>
      </div>

      <ErrorBoundary>
        <Suspense fallback={<SearchPageSkeleton />}>
          <SearchPage />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
