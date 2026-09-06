import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';

export default async function CanvasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await requireSession();
  if (!session) return null;
  const params = await searchParams;
  const leftId = params.left;
  const rightId = params.right;

  const [left, right] = await Promise.all([
    leftId ? prisma.thread.findUnique({ where: { id: leftId }, select: { id: true, name: true, aiSummary: true } }) : null,
    rightId ? prisma.thread.findUnique({ where: { id: rightId }, select: { id: true, name: true, aiSummary: true } }) : null,
  ]);

  return (
    <div className="p-6">
      <h1 className="font-serif-heading text-xl mb-4">Research Canvas</h1>
      <p className="text-xs text-ink-3 mb-4">Compare two threads side-by-side. AI diff highlights contradictions.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="text-sm font-medium mb-2">{left?.name ?? 'Select left thread via ?left=<id>'}</h2>
          <p className="text-xs text-ink-2 whitespace-pre-wrap">{left?.aiSummary ?? 'No summary'}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="text-sm font-medium mb-2">{right?.name ?? 'Select right thread via ?right=<id>'}</h2>
          <p className="text-xs text-ink-2 whitespace-pre-wrap">{right?.aiSummary ?? 'No summary'}</p>
        </div>
      </div>
      {left && right && left.aiSummary && right.aiSummary && (
        <div className="mt-4 rounded-card border border-line bg-inset p-4">
          <p className="text-xs font-medium text-ink-3">AI diff (stub — reuses crossReference tier sort)</p>
          <p className="text-xs text-ink-2 mt-1">Contradiction check runs on save to collection; full diff wiring reuses `detectConflictFromSources`.</p>
        </div>
      )}
    </div>
  );
}
