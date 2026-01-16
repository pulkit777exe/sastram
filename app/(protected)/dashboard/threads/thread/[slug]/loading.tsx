export default function ThreadLoading() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <main className="flex flex-1 flex-col min-w-0 border-r">
        <header className="flex h-20 items-center justify-between px-8 border-b">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl animate-pulse bg-indigo-100" />
            <div className="flex flex-col gap-2">
              <div className="h-6 w-48 rounded animate-pulse bg-indigo-100" />
              <div className="h-4 w-32 rounded animate-pulse bg-indigo-100" />
            </div>
          </div>
          <div className="h-8 w-24 rounded-lg animate-pulse bg-indigo-100" />
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full animate-pulse shrink-0 bg-indigo-100" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-32 rounded animate-pulse bg-indigo-100" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded animate-pulse bg-indigo-100" />
                    <div className="h-4 w-3/4 rounded animate-pulse bg-indigo-100" />
                  </div>
                  <div className="flex gap-4">
                    <div className="h-6 w-16 rounded animate-pulse bg-indigo-100" />
                    <div className="h-6 w-20 rounded animate-pulse bg-indigo-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-4">
          <div className="h-20 rounded-lg animate-pulse" />
        </div>
      </main>

      <aside className="w-[340px] flex flex-col overflow-y-auto">
        <div className="p-8 border-b space-y-4">
          <div className="h-4 w-24 rounded animate-pulse bg-indigo-200" />
          <div className="h-6 w-full rounded animate-pulse bg-indigo-200" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded animate-pulse bg-indigo-200" />
            <div className="h-3 w-3/4 rounded animate-pulse bg-indigo-200" />
          </div>
          <div className="h-32 rounded-xl animate-pulse bg-indigo-200" />
          <div className="h-10 w-full rounded-xl animate-pulse bg-indigo-200" />
        </div>
      </aside>
    </div>
  );
}

