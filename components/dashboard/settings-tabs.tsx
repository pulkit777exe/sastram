"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { User, Mail } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AnimatedIcon } from "@/components/ui/animated-icon";

export function SettingsTabs({ activeTab }: { activeTab: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "newsletters", label: "Newsletters", icon: Mail },
  ];

  function handleTabChange(tabId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.push(`/dashboard/settings?${params.toString()}`);
  }

  return (
    <div className="border-b border-zinc-800">
      <nav className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2",
                isActive
                  ? "text-white border-indigo-500"
                  : "text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700"
              )}
            >
              <AnimatedIcon icon={Icon} size={16} animateOnHover />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

