export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="skeleton h-6 w-28" />
          <div className="flex items-center gap-4">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="skeleton h-4 w-16" />
          </div>
        </div>
      </header>
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="skeleton h-8 w-32 mx-auto rounded-full" />
          <div className="skeleton h-10 w-3/4 mx-auto" />
          <div className="skeleton h-4 w-2/3 mx-auto" />
          <div className="max-w-md mx-auto">
            <div className="border border-border rounded-3xl p-8 space-y-6 bg-card">
              <div className="skeleton h-5 w-24" />
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-10 w-24" />
              <div className="space-y-3">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-4/6" />
              </div>
              <div className="skeleton h-11 w-full" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
