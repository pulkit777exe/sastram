"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  User2,
  Shield,
  Settings,
  Bell,
  Search,
} from "lucide-react";
import { motion } from "framer-motion";

interface SidebarProps {
  role: "USER" | "ADMIN";
  name: string;
}

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Threads", href: "/dashboard/threads", icon: MessageSquare },
  { name: "Profile", href: "/profile", icon: User2 },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar({ role, name }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === "ADMIN";

  return (
    <aside className="hidden w-72 flex-col bg-[#0E1015] text-white lg:flex">
      <div className="flex items-center justify-between px-6 py-6">
        <div className="text-xl font-semibold">Sastram</div>
        <button className="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/5">
          <Search className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6">
        <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Notifications</p>
          <p className="mt-2 text-sm text-white/80">
            Threads synced. Digests scheduled in the last 24h.
          </p>
          <button className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1 text-xs font-semibold text-slate-900">
            <Bell className="h-3 w-3" />
            Review
          </button>
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-1 px-4">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href;
          return (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  isActive ? "bg-white text-slate-900" : "text-white/60 hover:bg-white/5",
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-slate-900" : "text-white/50")} />
                {item.name}
              </Link>
            </motion.div>
          );
        })}

        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className={cn(
              "mt-4 flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/5",
              pathname === "/dashboard/admin" && "bg-white text-slate-900",
            )}
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        )}
      </nav>

      <div className="p-6">
        <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Signed in as</p>
          <p className="mt-2 text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-white/60">{role}</p>
        </div>
      </div>
    </aside>
  );
}