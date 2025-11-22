"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  PieChart,
  HelpCircle,
} from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";

const sidebarItems = [
  {
    title: "MAIN MENU",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Products", href: "#", icon: CreditCard },
      { name: "Transactions", href: "#", icon: BarChart3 },
      { name: "Reports & Analytics", href: "#", icon: PieChart },
      { name: "Message", href: "/dashboard/messages", icon: MessageSquare, badge: 12 },
      { name: "Team Performance", href: "#", icon: Users },
      { name: "Campaign", href: "/dashboard/topics", icon: BarChart3 },
    ],
  },
  {
    title: "CUSTOMERS",
    items: [
      { name: "Customers", href: "#", icon: Users },
      { name: "Channels", href: "#", icon: MessageSquare },
      { name: "Orders", href: "#", icon: CreditCard },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { name: "Customer Support", href: "#", icon: HelpCircle },
      { name: "Help Center", href: "#", icon: HelpCircle },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-[#F8F9FA]">
      <div className="p-6">
        <div className="flex items-center gap-2 font-semibold text-xl mb-8">
          <div className="bg-blue-600 text-white p-1 rounded-lg">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          Salesin
        </div>

        <div className="bg-white p-3 rounded-xl border shadow-sm mb-6 flex items-center gap-3">
           <div className="bg-blue-100 p-2 rounded-lg">
             <div className="h-5 w-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold">S</div>
           </div>
           <div>
             <div className="text-xs text-muted-foreground">Agency</div>
             <div className="text-sm font-semibold">Spark Pixel Team</div>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <nav className="space-y-6">
          {sidebarItems.map((section, i) => (
            <motion.div 
              key={section.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground/70 tracking-wider">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-muted-foreground hover:bg-white/50 hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={cn("h-4 w-4", isActive ? "text-blue-600" : "text-muted-foreground")} />
                        {item.name}
                      </div>
                      {item.badge && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t">
        <Link href="/dashboard/profile" className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors">
           <div className="h-8 w-8 rounded-full bg-slate-200 overflow-hidden">
              <Image src="https://github.com/shadcn.png" alt="User" width={32} height={32} />
           </div>
           <div className="flex-1">
             <div className="text-sm font-medium">Pulkit</div>
             <div className="text-xs text-muted-foreground">Admin</div>
           </div>
        </Link>
      </div>
    </div>
  );
}