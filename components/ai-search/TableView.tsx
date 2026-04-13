"use client";

import { useState } from "react";
import { ArrowUpDown, Download, ExternalLink } from "lucide-react";
import type { Source } from "@/modules/ai-search/types";
import { TimeAgo } from "@/components/ui/TimeAgo";

interface TableViewProps {
  sources: Source[];
}

type SortKey = "confidence" | "tier" | "publishedDate";
type SortDir = "asc" | "desc";

const TIER_LABELS: Record<number, string> = {
  1: "Official",
  2: "Trusted",
  3: "Community",
  4: "Blog",
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
    <button
      onClick={() => onToggle(sortKeyVal)}
      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown
        size={10}
        className={sortKey === sortKeyVal ? "text-foreground" : "opacity-30"}
      />
    </button>
  );
}

export function TableView({ sources }: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...sources].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "confidence") return (a.confidence - b.confidence) * dir;
    if (sortKey === "tier") return (a.tier - b.tier) * dir;
    if (sortKey === "publishedDate") {
      const da = a.publishedDate ? new Date(a.publishedDate).getTime() : 0;
      const db = b.publishedDate ? new Date(b.publishedDate).getTime() : 0;
      return (da - db) * dir;
    }
    return 0;
  });

  const exportCSV = () => {
    const headers = [
      "Source",
      "Title",
      "URL",
      "Confidence",
      "Tier",
      "Published",
      "Provider",
    ];
    const rows = sorted.map((s) => [
      s.domain,
      `"${s.title.replace(/"/g, '""')}"`,
      s.url,
      String(s.confidence),
      TIER_LABELS[s.tier],
      s.publishedDate || "N/A",
      s.provider,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-search-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden max-w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">
          {sources.length} Results
        </span>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-foreground/5 hover:bg-foreground/10 rounded-lg transition-colors"
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground w-[18%]">
                Source
              </th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground w-[30%]">
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
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground w-[14%]">
                Provider
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border/50 hover:bg-foreground/2 transition-colors"
              >
                <td className="px-4 py-2.5 text-muted-foreground truncate">
                  {s.domain}
                </td>
                <td className="px-4 py-2.5">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:underline inline-flex items-center gap-1 truncate max-w-full"
                  >
                    <span className="truncate">{s.title}</span>
                    <ExternalLink size={10} className="shrink-0 opacity-40" />
                  </a>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.confidence}%`,
                          backgroundColor: "var(--color-foreground)",
                        }}
                      />
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {s.confidence}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-muted-foreground">
                    {TIER_LABELS[s.tier]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center text-muted-foreground">
                  {s.publishedDate ? <TimeAgo date={s.publishedDate} /> : "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground capitalize">
                  {s.provider}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
