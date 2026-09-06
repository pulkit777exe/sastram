// Shared formatting helpers — extracted to avoid copy-paste across
// ai-search Sidebar / SaiSearchLayout and notification grouping.
// Keep implementations identical to previous inline versions to preserve behaviour.

/** Truncate history item label to 38 chars, preferring title over query. */
export function truncateHistoryLabel(
  title: string | null | undefined,
  query: string,
  maxLen = 38
): string {
  const t = title?.trim();
  if (t) {
    if (t.length > maxLen) return t.substring(0, maxLen) + '…';
    return t;
  }
  const q = query.trim();
  if (q.length > maxLen) return q.substring(0, maxLen) + '…';
  return q;
}

// Milliseconds in one day — avoids magic number in date math
const MS_PER_DAY = 86_400_000;

/** Bucket an ISO timestamp into Today / Yesterday / This week / Earlier. */
export function getHistoryDateGroup(createdAt: string): string {
  const d = new Date(createdAt);
  const now = new Date();
  const startOfDay = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / MS_PER_DAY);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This week';
  return 'Earlier';
}

/** Group items that carry a `createdAt: string` by the date label above. */
export function groupByHistoryDate<T extends { createdAt: string }>(
  items: T[]
): { group: string; items: T[] }[] {
  const grouped: { group: string; items: T[] }[] = [];
  for (const item of items) {
    const group = getHistoryDateGroup(item.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.group === group) last.items.push(item);
    else grouped.push({ group, items: [item] });
  }
  return grouped;
}

/** Notification grouping variant (Today/Yesterday/This Week/Older) — same semantics, explicit label. */
export function getNotificationDateGroup(createdAt: Date | string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  if (createdDay.getTime() === today.getTime()) return 'Today';
  if (createdDay.getTime() === yesterday.getTime()) return 'Yesterday';
  if (createdDay >= weekAgo) return 'This Week';
  return 'Older';
}
