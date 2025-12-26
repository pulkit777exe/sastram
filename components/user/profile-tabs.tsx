"use client";

import { useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Info, Activity } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ProfileTabsProps {
  defaultTab?: "threads" | "about" | "activity";
  threads?: ReactNode;
  about?: ReactNode;
  activity?: ReactNode;
}

export function ProfileTabs({ defaultTab = "threads", threads, about, activity }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabs = [
    { id: "threads" as const, label: "Threads", icon: MessageSquare },
    { id: "about" as const, label: "About", icon: Info },
    { id: "activity" as const, label: "Activity", icon: Activity },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Buttons */}
      <div className="flex gap-2 border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative px-4 py-2 text-sm font-medium transition-colors",
                "hover:text-foreground",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "threads" && threads}
          {activeTab === "about" && about}
          {activeTab === "activity" && activity}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

