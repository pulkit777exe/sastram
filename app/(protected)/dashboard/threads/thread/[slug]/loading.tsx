export default function ThreadLoading() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#161618]">
      <main className="flex flex-1 flex-col min-w-0 border-r border-zinc-800/50">
        {/* Header Skeleton */}
        <header className="flex h-20 items-center justify-between px-8 border-b">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="h-6 w-48 rounded animate-pulse" />
              <div className="h-4 w-32 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-8 w-24 rounded-lg animate-pulse" />
        </header>

        {/* Content Skeleton */}
        <div className="flex-1 overflow-y-auto bg-[#141416]">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* Comment skeletons */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full animate-pulse shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-32 rounded animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded animate-pulse" />
                    <div className="h-4 w-3/4 rounded animate-pulse" />
                  </div>
                  <div className="flex gap-4">
                    <div className="h-6 w-16 rounded animate-pulse" />
                    <div className="h-6 w-20 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Skeleton */}
        <div className="border-t border-zinc-800/50 bg-[#161618] p-4">
          <div className="h-20 rounded-lg animate-pulse" />
        </div>
      </main>

      {/* Sidebar Skeleton */}
      <aside className="w-[340px] flex flex-col bg-[#161618] overflow-y-auto">
        <div className="p-8 border-b border-zinc-800/50 space-y-4">
          <div className="h-4 w-24 rounded animate-pulse" />
          <div className="h-6 w-full rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded animate-pulse" />
            <div className="h-3 w-3/4 rounded animate-pulse" />
          </div>
          <div className="h-32 rounded-xl animate-pulse" />
          <div className="h-10 w-full rounded-xl animate-pulse" />
        </div>
      </aside>
    </div>
  );
}

