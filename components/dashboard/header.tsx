"use client";

import * as React from "react";
import { Search, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePathname } from "next/navigation";
import { AnimatedIcon } from "@/components/ui/animated-icon";
import { SearchDialog } from "./search-dialog";

export function DashboardHeader() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map(
    (segment) => segment.charAt(0).toUpperCase() + segment.slice(1),
  );
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb} className="flex items-center gap-2">
              <span
                className={
                  index === breadcrumbs.length - 1
                    ? "font-semibold text-foreground"
                    : ""
                }
              >
                {crumb}
              </span>
              {index < breadcrumbs.length - 1 && (
                <span className="text-muted-foreground/50">/</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div
            className="relative hidden md:block cursor-pointer"
            onClick={() => setOpen(true)}
          >
            <AnimatedIcon
              icon={Search}
              className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            />
            <div className="flex h-9 w-64 items-center rounded-full bg-muted pl-9 text-sm text-muted-foreground border-border border">
              Search users...
            </div>
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1 text-xs text-muted-foreground">
              <AnimatedIcon icon={Command} className="h-3 w-3" />
              <span>K</span>
            </div>
          </div>
        </div>
      </header>
      <SearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
