"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  BookOpen,
  Code2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PastSearch } from "@/modules/ai-search/types";

interface SidebarProps {
  searches: PastSearch[];
  onSelectSearch: (query: string) => void;
  onDeleteSearch: (id: string) => void;
  onNewSearch: () => void;
  collapsed: boolean;
  onToggle: () => void;
  onOpenApiKeys: () => void;
  hasApiKeys: boolean;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Sidebar({
  searches,
  onSelectSearch,
  onDeleteSearch,
  onNewSearch,
  collapsed,
  onToggle,
  onOpenApiKeys,
  hasApiKeys,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      className={`relative h-full flex flex-col bg-card border border-border rounded-2xl transition-all duration-250 ease-in-out overflow-hidden ${
        collapsed ? "w-0 border-0 p-0" : "w-[220px]"
      }`}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`absolute top-4 z-10 p-1 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground transition-all duration-200 ${
          collapsed ? "-right-8" : "right-2"
        }`}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed && (
        <>
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              Sastram AI
            </h2>
          </div>

          {/* Nav items */}
          <div className="px-2 space-y-0.5">
            <button
              onClick={onNewSearch}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <Plus size={14} />
              New Search
            </button>

            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              onClick={() => {}}
            >
              <Search size={14} />
              Past Searches
            </button>

            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              onClick={() => {}}
            >
              <BookOpen size={14} />
              Library
            </button>

            <button
              onClick={onOpenApiKeys}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <Code2 size={14} />
              API Keys
              {hasApiKeys && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          </div>

          {/* Separator */}
          <div className="mx-3 my-3 h-px bg-border" />

          {/* Recent searches */}
          <div className="flex-1 overflow-y-auto px-2">
            {searches.length === 0 ? (
              <p className="px-3 text-[11px] text-muted-foreground/50 italic">
                No recent searches
              </p>
            ) : (
              <div className="space-y-0.5">
                {searches.map((s) => (
                  <div
                    key={s.id}
                    className="group relative"
                    onMouseEnter={() => setHoveredId(s.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <button
                      onClick={() => onSelectSearch(s.query)}
                      className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors truncate pr-7"
                    >
                      <span className="truncate block">
                        {s.query.length > 32
                          ? s.query.substring(0, 32) + "..."
                          : s.query}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 block">
                        {timeAgo(s.timestamp)}
                      </span>
                    </button>
                    {hoveredId === s.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSearch(s.id);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-foreground transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom profile placeholder */}
          <div className="px-3 pb-3 pt-2 border-t border-border mt-auto">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-bold text-foreground">
                S
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  Sastram User
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  Personal workspace
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
