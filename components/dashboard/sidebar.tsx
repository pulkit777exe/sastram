"use client";

import {
  Home,
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
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AnimatedIcon } from "@/components/ui/animated-icon";

export function Sidebar({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebarCollapsed");
      return saved === "true";
    }
    return false;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarCollapsed", String(newState));
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(
        `/dashboard/threads?q=${encodeURIComponent(searchQuery.trim())}`
      );
    }
  };

  const navItems = [
    { icon: Home, label: "Home", href: "/dashboard" },
    { icon: FileText, label: "Threads", href: "/dashboard/threads" },
    { icon: Bookmark, label: "Bookmarks", href: "/dashboard/bookmarks" },
    { icon: Search, label: "Search", href: "/dashboard/search" },
    { icon: Activity, label: "Activity", href: "/dashboard/activity" },
    { icon: Bell, label: "Notifications", href: "/dashboard/messages" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
  ];

  if (role === "ADMIN") {
    navItems.push(
      {
        icon: Flag,
        label: "Reports",
        href: "/dashboard/admin/reports",
      },
      {
        icon: Shield,
        label: "Moderation",
        href: "/dashboard/admin/moderation",
      }
    );
  }

  return (
    <aside
      className={cn(
        "bg-card rounded-2xl border border-border flex flex-col h-full transition-all duration-300 overflow-hidden",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="p-4 flex items-center justify-between">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="font-bold text-lg text-foreground">Sastram</span>
          </Link>
        )}
        {isCollapsed && <div />}
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={toggleCollapse}
              className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <AnimatedIcon icon={PanelLeftClose} size={18} animateOnHover />
            </button>
          </div>
        )}
        {isCollapsed && (
          <div className="flex justify-center w-full">
            <button
              onClick={toggleCollapse}
              className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <AnimatedIcon icon={PanelLeftOpen} size={18} animateOnHover />
            </button>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <>
          <div className="px-4 mb-4">
            <form onSubmit={handleSearch} className="relative group">
              <AnimatedIcon
                icon={Search}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={14}
              />
              <input
                type="text"
                placeholder="Search threads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-muted border border-border rounded-md py-1.5 pl-9 pr-12 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <kbd className="text-[10px] bg-background px-1 rounded border border-border text-muted-foreground">
                  ⌘
                </kbd>
                <kbd className="text-[10px] bg-background px-1 rounded border border-border text-muted-foreground">
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
                  (item.href !== "/dashboard" && pathname.startsWith(item.href))
                }
                collapsed={false}
              />
            ))}

            <div className="mt-6 mb-2 px-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                Other
              </p>
            </div>

            <NavItem
              icon={UserPlus}
              label="Refer a Friend"
              href="#"
              collapsed={false}
            />
          </nav>

          <div className="m-3 p-4 bg-linear-to-br from-muted/50 to-muted border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-1 text-foreground">
              <AnimatedIcon icon={Sparkles} size={14} className="text-brand" />
              <p className="text-sm font-semibold">Boost with AI</p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              AI-powered replies and tools that save hours.
            </p>
            <button className="w-full bg-brand hover:bg-brand/90 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-lg shadow-brand/20">
              Upgrade to Pro
            </button>
          </div>
        </>
      )}

      {isCollapsed && (
        <nav className="flex-1 px-2 space-y-1 py-4">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              active={
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              }
              collapsed={true}
            />
          ))}
        </nav>
      )}

      <div className="p-3 border-t border-border relative">
        <div
          className="flex items-center justify-between p-2 hover:bg-accent rounded-lg cursor-pointer transition-colors"
          onClick={() => !isCollapsed && setShowProfileMenu(!showProfileMenu)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted shrink-0 flex items-center justify-center text-xs font-medium">
              {name.charAt(0).toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">
                  {name}
                </span>
                <span className="text-[10px] text-muted-foreground truncate w-24">
                  {email}
                </span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col gap-0.5 text-muted-foreground">
              <AnimatedIcon icon={ChevronUp} size={12} />
              <AnimatedIcon icon={ChevronDown} size={12} />
            </div>
          )}
        </div>
        {showProfileMenu && !isCollapsed && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-10">
            <Link
              href="/dashboard/settings/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
            >
              <AnimatedIcon icon={User} size={14} />
              <span>View Profile</span>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 px-4 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
            >
              <AnimatedIcon icon={Settings} size={14} />
              <span>Settings</span>
            </Link>
            <Link
              href="/dashboard/settings?tab=newsletters"
              className="flex items-center gap-2 px-4 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
            >
              <AnimatedIcon icon={Mail} size={14} />
              <span>Newsletters</span>
            </Link>
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
}

function NavItem({
  icon: Icon,
  label,
  href,
  active = false,
  collapsed,
}: NavItemProps) {
  if (href === "#") {
    return (
      <div
        className={cn(
          "group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          collapsed && "justify-center"
        )}
        title={collapsed ? label : undefined}
      >
        <AnimatedIcon
          icon={Icon}
          size={18}
          className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
          animateOnHover
        />
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200",
        active
          ? "bg-brand/5 text-brand shadow-sm border-r-2 border-brand"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
        collapsed && "justify-center"
      )}
      title={collapsed ? label : undefined}
    >
      <AnimatedIcon
        icon={Icon}
        size={18}
        className={cn(
          "transition-colors shrink-0",
          active
            ? "text-brand"
            : "text-muted-foreground group-hover:text-foreground"
        )}
        animateOnHover
      />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}

      {active && !collapsed && (
        <div className="ml-auto w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_rgba(55,54,252,0.5)]" />
      )}
    </Link>
  );
}
