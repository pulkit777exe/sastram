import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchPage } from '@/components/ai-search/SearchPage';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import { getSession } from '@/modules/auth/session';

export const metadata: Metadata = {
  title: 'Sai Search — Sastram',
  description:
    'Search across Reddit, Hacker News, ArchWiki, Stack Overflow and more with Sai-powered synthesis.',
};

function SearchPageSkeleton() {
  return (
    <div className="flex gap-4 items-start">
      {/* Sidebar placeholder — matches Sidebar's expanded width */}
      <div className="w-55 shrink-0 h-120 bg-card border border-border rounded-2xl p-4 space-y-3">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="pt-2 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
       </div>
     </div>

      <div className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-4xl px-4 md:px-6 space-y-6 sm:space-y-8">
          {/* Top bar skeleton — toggle + spacer + action button */}
          <div className="flex items-center gap-2">
            <Skeleton className="min-w-11 min-h-11 h-11 w-11 rounded-xl" />
            <div className="flex-1" />
            <Skeleton className="hidden sm:inline-block h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
         </div>

          {/* Compact search box skeleton */}
          <Skeleton className="h-12 w-full rounded-xl" />

          {/* Phase tracker row skeleton — same width as search box */}
          <div className="flex items-center gap-1 w-full">
            <Skeleton className="h-6 flex-1 rounded-full" />
            <Skeleton className="h-6 flex-1 rounded-full" />
            <Skeleton className="h-6 flex-1 rounded-full" />
            <Skeleton className="h-6 flex-1 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full shrink-0" />
         </div>

          {/* Two-pane synthesis + sources skeleton — matches the real grid ratio */}
          <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
           </div>
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
           </div>
         </div>
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
    <div className="mx-auto w-full max-w-4xl px-4 md:px-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em] mb-2">
          <Search size={14} />
          <span>Sai Search</span>
       </div>
        <h1 className="text-4xl font-bold tracking-tight">Search with Sai</h1>
        <p className="text-muted-foreground mt-2">
          Search across Reddit, Hacker News, ArchWiki, Stack Overflow and more.
       </p>
     </div>

      <ErrorBoundary>
       <Suspense fallback={<SearchPageSkeleton />}>
         <SearchPage user={user} />
      </Suspense>
     </ErrorBoundary>
   </div>
  );
}