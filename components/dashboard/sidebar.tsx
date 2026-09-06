'use client';

import {
  Bell,
  Settings,
  FileText,
  UserPlus,
  Sparkles,
  ChevronUp,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  User,
  Mail,
  Flag,
  Shield,
  Bookmark,
  Activity,
  LogOut,
  LineChart,
  Tags,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clientLogger } from '@/lib/utils/client-logger';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { useNotification } from '@/components/bootstrap-provider';
import { signOut } from '@/lib/services/auth-client';

export function Sidebar({
  name,
  email,
  role,
  mobile = false,
  onNavigate,
}: {
  name: string;
  email: string;
  role: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Hydrate persisted collapse state after mount to avoid SSR/client mismatch.
  useEffect(() => {
    if (mobile) return;
    const saved = localStorage.getItem('sidebarCollapsed');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setIsCollapsed(saved === 'true');
  }, [mobile]);

  const { unreadNotificationCount } = useNotification();
  const unreadCount = unreadNotificationCount ?? 0;

  const hideTimeout = useRef<number | null>(null);

  const clearHideTimeout = () => {
    if (typeof window === 'undefined') return;
    if (hideTimeout.current) {
      window.clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearHideTimeout();
    if (!isCollapsed) {
      setProfileMenuClosing(false);
      setShowProfileMenu(true);
    }
  };

  const handleMouseLeave = () => {
    clearHideTimeout();
    if (typeof window === 'undefined') return;
    hideTimeout.current = window.setTimeout(() => {
      setProfileMenuClosing(true);
      setTimeout(() => {
        setShowProfileMenu(false);
        setProfileMenuClosing(false);
      }, closeMs);
      hideTimeout.current = null;
    }, 500);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [profileMenuClosing, setProfileMenuClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMs = 150;

  const toggleCollapse = () => {
    if (mobile) return;
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', String(newState));
    }
  };

  const effectiveCollapsed = mobile ? false : isCollapsed;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard/sai-search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/login?reason=logged_out');
    } catch (error) {
      clientLogger.error('Sidebar', 'Logout failed', error);
    }
  };

  const navItems = [
    { icon: Sparkles, label: 'Sai Search', href: '/dashboard/sai-search' },
    { icon: FileText, label: 'Threads', href: '/dashboard/threads' },
    { icon: Bookmark, label: 'Bookmarks', href: '/dashboard/bookmarks' },
    { icon: Search, label: 'Search', href: '/dashboard/search' },
    { icon: Activity, label: 'Activity', href: '/dashboard/activity' },
    {
      icon: Bell,
      label: 'Notifications',
      href: '/dashboard/notifications',
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
  ];

  if (role === 'ADMIN') {
    navItems.push(
      {
        icon: Flag,
        label: 'Reports',
        href: '/dashboard/admin/reports',
      },
      {
        icon: Shield,
        label: 'Moderation',
        href: '/dashboard/admin/moderation',
      },
      {
        icon: LineChart,
        label: 'System Health',
        href: '/dashboard/admin/health',
      },
      {
        icon: Tags,
        label: 'Tags',
        href: '/dashboard/admin/tags',
      }
    );
  }

  return (
    <aside
      className={cn(
        'bg-surface rounded-card border border-line flex flex-col h-full transition-all duration-300 overflow-hidden',
        effectiveCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-4 flex items-center justify-between">
        {!effectiveCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
            <Logo brand className="h-5 w-5 shrink-0" />
            <span className="font-semibold text-base text-ink tracking-tight">Sastram</span>
          </Link>
        )}
        {effectiveCollapsed && <div />}
        {!effectiveCollapsed && !mobile && (
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={toggleCollapse}>
              <AnimatedIcon icon={PanelLeftClose} size={18} animateOnHover />
            </Button>
          </div>
        )}
        {!effectiveCollapsed && mobile && (
          <ThemeToggle />
        )}
        {effectiveCollapsed && (
          <div className="flex justify-center w-full">
            <button
              type="button"
              onClick={toggleCollapse}
              className="flex items-center justify-center p-1 rounded-control hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Expand sidebar"
            >
              <Logo brand className="h-6 w-6 shrink-0" />
            </button>
          </div>
        )}
      </div>

      {!effectiveCollapsed && (
        <>
          <div className="px-4 mb-4">
            <form onSubmit={handleSearch} className="relative group">
              <AnimatedIcon
                icon={Search}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={14}
              />
              <Input
                type="text"
                placeholder="Search with Sai..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-field border-line rounded-control py-1.5 pl-9 pr-12 text-xs h-auto"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <kbd className="text-xs bg-background px-1 rounded border border-line text-ink-3">
                  ⌘
                </kbd>
                <kbd className="text-xs bg-background px-1 rounded border border-line text-ink-3">
                  F
                </kbd>
              </div>
            </form>
          </div>

          <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                }
                collapsed={false}
                badge={item.badge}
                onNavigate={onNavigate}
              />
            ))}

            <div className="mt-6 mb-2 px-3">
              <p className="text-xs font-bold text-ink-3 uppercase">Other</p>
            </div>

            <NavItem icon={UserPlus} label="Refer a Friend" href="#" collapsed={false} onNavigate={onNavigate}></NavItem>
          </nav>

          <div className="mx-3 mb-3 px-3 py-2 text-ink-3">
            <div className="flex items-center gap-2 mb-1 text-ink">
              <AnimatedIcon icon={Sparkles} size={14} className="text-brand" />
              <p className="text-sm font-semibold">Boost with Sai</p>
            </div>
            <p className="text-xs text-ink-3">
              Sai-powered replies and tools that save hours.
            </p>
          </div>
        </>
      )}

      {effectiveCollapsed && (
        <nav className="flex-1 px-2 space-y-1 py-4">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              active={
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href))
              }
              collapsed={true}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      )}

      <div
        className="p-3 border-t border-line relative duration-300 transition-shadow"
        onMouseEnter={!effectiveCollapsed ? handleMouseEnter : undefined}
        onMouseLeave={!effectiveCollapsed ? handleMouseLeave : undefined}
      >
        {!effectiveCollapsed ? (
          <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3 shadow-linear-sm hover:bg-hover cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-field shrink-0 flex items-center justify-center text-xs font-medium text-ink">
                {name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">{name}</span>
                <span className="text-xs text-ink-3 truncate w-24">{email}</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 text-muted-foreground">
              <AnimatedIcon icon={ChevronUp} size={12} />
              <AnimatedIcon icon={ChevronDown} size={12} />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <Button variant="ghost" size="icon" onClick={toggleCollapse}>
              <AnimatedIcon icon={PanelLeftOpen} size={18} animateOnHover />
            </Button>
          </div>
        )}
        {showProfileMenu && !effectiveCollapsed && (
          <div
            ref={menuRef}
            className={cn(
              't-dropdown absolute bottom-full mb-2 bg-popover border border-line rounded-control shadow-linear-lg overflow-hidden z-10',
              profileMenuClosing ? 'is-closing' : 'is-open'
            )}
            data-origin="bottom-left"
          >
            <Link
              href="/dashboard/settings/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-popover-foreground hover:bg-hover transition-colors"
              onClick={onNavigate}
            >
              <AnimatedIcon icon={User} size={14} />
              <span>View Profile</span>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 px-4 py-2 text-sm text-popover-foreground hover:bg-hover transition-colors"
              onClick={onNavigate}
            >
              <AnimatedIcon icon={Settings} size={14} />
              <span>Settings</span>
            </Link>
            <Link
              href="/dashboard/settings?tab=newsletters"
              className="flex items-center gap-2 px-4 py-2 text-sm text-popover-foreground hover:bg-hover transition-colors"
              onClick={onNavigate}
            >
              <AnimatedIcon icon={Mail} size={14} />
              <span>Newsletters</span>
            </Link>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors w-full justify-start"
              onClick={() => { handleLogout(); onNavigate?.(); }}
            >
              <AnimatedIcon icon={LogOut} size={14} className="text-destructive" />
              <span className="font-medium">Log out</span>
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  active?: boolean;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}

function NavItem({ icon: Icon, label, href, active = false, collapsed, badge, onNavigate }: NavItemProps) {
  if (href === '#') {
    return (
      <div
        className={cn(
          'group flex items-center gap-3 px-3 py-2 rounded-control cursor-pointer transition-all duration-200',
          'text-ink-3 hover:text-ink hover:bg-hover',
          collapsed && 'justify-center'
        )}
        title={collapsed ? label : undefined}
      >
        <AnimatedIcon
          icon={Icon}
          size={18}
          className="text-ink-3 group-hover:text-ink transition-colors shrink-0"
          animateOnHover
        />
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-control cursor-pointer transition-all duration-200',
        active
          ? 'bg-brand/5 text-brand shadow-linear-sm border-r-2 border-brand'
          : 'text-ink-3 hover:text-ink hover:bg-hover',
        collapsed && 'justify-center'
      )}
      title={collapsed ? label : undefined}
    >
      <AnimatedIcon
        icon={Icon}
        size={18}
        className={cn(
          'transition-colors shrink-0',
          active ? 'text-brand' : 'text-ink-3 group-hover:text-ink'
        )}
        animateOnHover
      />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}

      {badge != null && badge > 0 && (
        <Badge
            variant="destructive-subtle"
            className={cn(
              'ml-auto h-5 min-w-5 px-1 text-xs font-bold',
              collapsed && 'absolute -top-1 -right-1 h-4 min-w-4 text-xs'
            )}
          >
          {badge > 99 ? '99+' : badge}
        </Badge>
      )}

      {badge != null && badge > 0 && !collapsed && (
        <Badge variant="destructive-subtle" className="ml-auto h-5 min-w-5 px-1 text-xs font-bold">
          {badge > 99 ? '99+' : badge}
        </Badge>
      )}
      {badge != null && badge > 0 && collapsed && (
        <span className="t-badge" data-open="true">
          <Badge variant="destructive-subtle" className="t-badge-dot h-4 min-w-4 px-1 text-xs font-bold">
            {badge > 99 ? '99+' : badge}
          </Badge>
        </span>
      )}

      {active && !collapsed && !badge && (
        <div className="ml-auto w-2 h-2 rounded-full bg-brand shadow-linear-sm" />
      )}
    </Link>
  );
}
