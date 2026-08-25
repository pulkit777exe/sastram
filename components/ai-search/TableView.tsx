'use client';

import { useState } from 'react';
import { ArrowUpDown, Download, ExternalLink } from 'lucide-react';
import type { Source } from '@/modules/ai-search/types';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { Button } from '@/components/ui/button';

interface TableViewProps {
  sources: Source[];
}

type SortKey = 'confidence' | 'tier' | 'publishedDate';
type SortDir = 'asc' | 'desc';

const TIER_LABELS: Record<number, string> = {
  1: 'Official',
  2: 'Trusted',
  3: 'Community',
  4: 'Blog',
};

function SortHeader({
  label,
  sortKeyVal,
  sortKey,
  onToggle,
}: {
  label: string;
  sortKeyVal: SortKey;
  sortKey: SortKey;
  onToggle: (key: SortKey) => void;
}) {
  return (
    <Button type="button"
      onClick={() => onToggle(sortKeyVal)}
      variant="ghost"
      size="sm"
      className="justify-start gap-1 text-xs font-medium text-ink-2 hover:text-ink"
    >
      {label}
      <ArrowUpDown
        size={10}
        className={sortKey === sortKeyVal ? 'text-ink' : 'opacity-30'}
      />
    </Button>
  );
}

export function TableView({ sources }: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...sources].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'confidence') return (a.confidence - b.confidence) * dir;
    if (sortKey === 'tier') return (a.tier - b.tier) * dir;
    if (sortKey === 'publishedDate') {
      const da = a.publishedDate ? new Date(a.publishedDate).getTime() : 0;
      const db = b.publishedDate ? new Date(b.publishedDate).getTime() : 0;
      return (da - db) * dir;
    }
    return 0;
  });

  const exportCSV = () => {
    const headers = ['Source', 'Title', 'URL', 'Confidence', 'Tier', 'Published', 'Provider'];
    const rows = sorted.map((s) => [
      s.domain,
      `"${s.title.replace(/"/g, '""')}"`,
      s.url,
      String(s.confidence),
      TIER_LABELS[s.tier],
      s.publishedDate || 'N/A',
      s.provider,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-search-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-surface border border-line rounded-card overflow-hidden max-w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-sm font-medium text-ink">{sources.length} Results</span>
        <Button type="button"
          onClick={exportCSV}
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-ink-2 hover:text-ink"
        >
          <Download size={12} />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed min-w-150">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-2 w-[18%]">
                Source
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-2 w-[30%]">
                Title
              </th>
              <th className="px-4 py-2.5 w-[16%]">
                <SortHeader
                  label="Confidence"
                  sortKeyVal="confidence"
                  sortKey={sortKey}
                  onToggle={toggleSort}
                />
              </th>
              <th className="px-4 py-2.5 w-[10%]">
                <SortHeader
                  label="Tier"
                  sortKeyVal="tier"
                  sortKey={sortKey}
                  onToggle={toggleSort}
                />
              </th>
              <th className="px-4 py-2.5 w-[12%]">
                <SortHeader
                  label="Date"
                  sortKeyVal="publishedDate"
                  sortKey={sortKey}
                  onToggle={toggleSort}
                />
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-2 w-[14%]">
                Provider
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.id}
                className="border-b border-line/50 hover:bg-hover/30 transition-colors"
              >
                <td className="px-4 py-2.5 text-ink-2 truncate">{s.domain}</td>
                <td className="px-4 py-2.5">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink hover:underline inline-flex items-center gap-1 truncate max-w-full"
                  >
                    <span className="truncate">{s.title}</span>
                    <ExternalLink size={10} className="shrink-0 opacity-40" />
                  </a>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-10 h-1 bg-hover rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.confidence}%`,
                          backgroundColor: 'var(--ink)',
                        }}
                      />
                    </div>
                    <span className="tabular-nums text-ink-2">{s.confidence}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-ink-2">{TIER_LABELS[s.tier]}</span>
                </td>
                <td className="px-4 py-2.5 text-center text-ink-2">
                  {s.publishedDate ? <TimeAgo date={s.publishedDate} /> : '—'}
                </td>
                <td className="px-4 py-2.5 text-ink-2 capitalize">{s.provider}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
