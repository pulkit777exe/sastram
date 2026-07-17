import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function AiNotConfiguredNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-amber-700 dark:text-amber-400',
        className
      )}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed">
        Sai features aren&apos;t configured for this deployment. Set{' '}
        <code className="font-mono text-[10px] bg-amber-100 dark:bg-amber-900/50 px-1 py-px rounded">
          GEMINI_API_KEY
        </code>{' '}
        or{' '}
        <code className="font-mono text-[10px] bg-amber-100 dark:bg-amber-900/50 px-1 py-px rounded">
          OPENAI_API_KEY
        </code>{' '}
        to enable them.
      </p>
    </div>
  );
}
