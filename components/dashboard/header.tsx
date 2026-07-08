'use client';

import * as React from 'react';
import { Search, Command, Bell } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import dynamic from 'next/dynamic';
import { useNotification } from '@/components/bootstrap-provider';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const SearchDialog = dynamic(
  () => import('./search-dialog').then((mod) => mod.SearchDialog),
  { ssr: false }
);

export function DashboardHeader() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs = segments.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
  const [open, setOpen] = React.useState(false);
  const { unreadNotificationCount } = useNotification();
  const unreadCount = unreadNotificationCount ?? 0;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb} className="flex items-center gap-2">
              <span
                className={index === breadcrumbs.length - 1 ? 'font-semibold text-foreground' : ''}
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
          <Link
            href="/dashboard/notifications"
            className="relative p-2 hover:bg-muted rounded-full transition-colors"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center p-0 bg-red-500 text-white text-[10px]">
                {unreadLabel}
              </Badge>
            )}
          </Link>
          <button
            type="button"
            className="relative hidden md:block cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-brand/20 rounded-full"
            onClick={() => setOpen(true)}
            aria-label="Search users"
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
          </button>
        </div>
      </header>
      <SearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
