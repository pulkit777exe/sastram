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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { LucideIcon } from "lucide-react";

export function Sidebar({ name, email, role }: { name: string; email: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved !== null) {
      setIsCollapsed(saved === "true");
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", String(newState));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard/threads?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const navItems = [
    { icon: Home, label: "Home", href: "/dashboard" },
    { icon: FileText, label: "Threads", href: "/dashboard/threads" },
    { icon: Bell, label: "Notifications", href: "/dashboard/messages" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
  ];

  if (role === "ADMIN") {
    navItems.push({ icon: Flag, label: "Reports", href: "/dashboard/admin/reports" });
  }

  return (
    <aside
      className={cn(
        "bg-[#161618] rounded-2xl border border-zinc-800/50 flex flex-col overflow-hidden transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="p-4 flex items-center justify-between">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
              <div className="w-3 h-3 border-2 border-black rounded-full" />
            </div>
            <span className="font-bold text-lg text-white">Sastram</span>
          </Link>
        )}
        {isCollapsed && (
          <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center mx-auto">
            <div className="w-3 h-3 border-2 border-black rounded-full" />
          </div>
        )}
        <button
          onClick={toggleCollapse}
          className="text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
        >
          {isCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="px-4 mb-4">
            <form onSubmit={handleSearch} className="relative group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                size={14}
              />
              <input
                type="text"
                placeholder="Search threads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-zinc-800 rounded-md py-1.5 pl-9 pr-12 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <kbd className="text-[10px] bg-zinc-800 px-1 rounded border border-zinc-700 text-zinc-500">
                  ⌘
                </kbd>
                <kbd className="text-[10px] bg-zinc-800 px-1 rounded border border-zinc-700 text-zinc-500">
                  F
                </kbd>
              </div>
            </form>
          </div>

          <nav className="flex-1 px-2 space-y-1">
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}
                collapsed={false}
              />
            ))}

            <div className="mt-6 mb-2 px-3">
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Other</p>
            </div>

            <NavItem icon={UserPlus} label="Refer a Friend" href="#" collapsed={false} />
          </nav>

          <div className="m-3 p-4 bg-linear-to-br from-[#1C1C1E] to-[#161618] border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 mb-1 text-white">
              <Sparkles size={14} />
              <p className="text-sm font-semibold">Boost with AI</p>
            </div>
            <p className="text-[11px] text-zinc-500 mb-4">
              AI-powered replies and tools that save hours.
            </p>
            <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20">
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
              active={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}
              collapsed={true}
            />
          ))}
        </nav>
      )}

      <div className="p-3 border-t border-zinc-800/50 relative">
        <div
          className="flex items-center justify-between p-2 hover:bg-[#1C1C1E] rounded-lg cursor-pointer"
          onClick={() => !isCollapsed && setShowProfileMenu(!showProfileMenu)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 shrink-0"></div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">{name}</span>
                <span className="text-[10px] text-zinc-500 truncate w-24">
                  {email}
                </span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col gap-0.5 text-zinc-500">
              <ChevronUp size={12} />
              <ChevronDown size={12} />
            </div>
          )}
        </div>
        {showProfileMenu && !isCollapsed && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#1C1C1E] border border-zinc-800 rounded-lg shadow-lg overflow-hidden z-10">
            <Link
              href="/dashboard/settings/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-[#252528] transition-colors"
            >
              <User size={14} />
              <span>View Profile</span>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-[#252528] transition-colors"
            >
              <Settings size={14} />
              <span>Settings</span>
            </Link>
            <Link
              href="/dashboard/settings?tab=newsletters"
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-[#252528] transition-colors"
            >
              <Mail size={14} />
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

function NavItem({ icon: Icon, label, href, active = false, collapsed }: NavItemProps) {
  if (href === "#") {
    return (
      <div
        className={cn(
          "group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200",
          "text-zinc-400 hover:text-zinc-200 hover:bg-[#1C1C1E]",
          collapsed && "justify-center"
        )}
        title={collapsed ? label : undefined}
      >
        <Icon
          size={18}
          className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0"
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
          ? "bg-linear-to-r from-[#212123] to-[#1C1C1E] text-white shadow-[0_0_20px_rgba(99,102,241,0.05)] border-r-2 border-indigo-500"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1C1C1E]",
        collapsed && "justify-center"
      )}
      title={collapsed ? label : undefined}
    >
      <Icon
        size={18}
        className={cn(
          "transition-colors shrink-0",
          active ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300"
        )}
      />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}

      {active && !collapsed && (
        <div className="ml-auto w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
      )}
    </Link>
  );
}
