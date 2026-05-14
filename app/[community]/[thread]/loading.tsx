export default function ThreadPageLoading() {
  return (
    <div className="h-full w-full bg-(--bg)">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_300px] gap-[24px] px-[24px] pb-[24px] pt-[16px]">
        <main className="flex min-w-0 flex-col gap-[16px] overflow-y-auto">
          <div className="rounded-[10px] bg-(--surface) p-[20px]">
            <div className="skeleton h-[140px] w-full rounded-[10px]" />

            <div className="mt-[16px] h-[28px] w-[70%] rounded-[6px] skeleton" />

            <div className="mt-[16px] flex items-center gap-[12px]">
              <div className="h-[32px] w-[32px] rounded-full skeleton" />
              <div className="flex flex-1 flex-col gap-[6px]">
                <div className="h-[12px] w-[120px] rounded-[4px] skeleton" />
                <div className="h-[10px] w-[180px] rounded-[4px] skeleton" />
              </div>
            </div>
          </div>

          <div className="rounded-[10px] bg-(--surface) p-[20px]">
            <div className="space-y-[20px]">
              {[0, 1, 2].map((key) => (
                <div key={key} className="flex gap-[12px]">
                  <div className="h-[32px] w-[32px] rounded-full skeleton" />
                  <div className="flex-1 space-y-[8px]">
                    <div className="h-[12px] w-[30%] rounded-[4px] skeleton" />
                    <div className="h-[12px] w-[90%] rounded-[4px] skeleton" />
                    <div className="h-[12px] w-[70%] rounded-[4px] skeleton" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] bg-(--surface) p-[16px]">
            <div className="h-[72px] w-full rounded-[8px] skeleton" />
          </div>
        </main>

        <aside className="hidden h-full min-h-0 flex-col gap-[16px] md:flex">
          <div className="rounded-[10px] bg-(--surface) p-[16px]">
            <div className="h-[16px] w-[40%] rounded-[4px] skeleton" />
            <div className="mt-[12px] h-[10px] w-[60%] rounded-[4px] skeleton" />
            <div className="mt-[16px] h-[40px] w-full rounded-[8px] skeleton" />
          </div>

          <div className="rounded-[10px] bg-(--surface) p-[16px]">
            <div className="h-[18px] w-[50%] rounded-[4px] skeleton" />
            <div className="mt-[16px] h-[96px] w-full rounded-[8px] skeleton" />
          </div>

          <div className="rounded-[10px] bg-(--surface) p-[16px]">
            <div className="h-[18px] w-[60%] rounded-[4px] skeleton" />
            <div className="mt-[12px] space-y-[8px]">
              {[0, 1, 2].map((key) => (
                <div key={key} className="flex items-center gap-[8px]">
                  <div className="h-[24px] w-[24px] rounded-full skeleton" />
                  <div className="h-[10px] w-[50%] rounded-[4px] skeleton" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
