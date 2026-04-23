'use client';

import { useRouter } from 'next/navigation';

interface ThreadErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ThreadError({ error, reset }: ThreadErrorProps) {
  const router = useRouter();

  return (
    <div className="flex h-screen w-full items-center justify-center bg-(--bg)">
      <div className="max-w-[420px] rounded-[12px] bg-(--surface) p-[24px] text-center shadow-sm">
        <h1 className="font-['Syne'] text-[22px] font-extrabold text-(--text)">
          This thread couldn&apos;t be loaded
        </h1>
        <p className="mt-[8px] text-[14px] text-muted">
          {error?.message ||
            'Something went wrong while loading this discussion. You can try again or go back to the previous page.'}
        </p>

        <div className="mt-[20px] flex justify-center gap-[12px]">
          <button
            type="button"
            onClick={reset}
            className="rounded-[6px] bg-(--blue) px-[14px] py-[8px] text-[13px] font-medium text-white hover:opacity-90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-[6px] border border-border px-[14px] py-[8px] text-[13px] font-medium text-(--text) hover:bg-(--bg)"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
