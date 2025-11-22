"use client";

import { Search, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePathname } from "next/navigation";

export function DashboardHeader() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb} className="flex items-center gap-2">
            <span className={index === breadcrumbs.length - 1 ? "font-semibold text-blue-600" : ""}>
              {crumb}
            </span>
            {index < breadcrumbs.length - 1 && <span className="text-slate-300">/</span>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Search..."
            className="h-9 w-64 rounded-full bg-slate-50 pl-9 text-sm border-slate-200 focus-visible:ring-blue-600"
          />
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 text-xs text-slate-400">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>
      </div>
    </header>
  );
}
