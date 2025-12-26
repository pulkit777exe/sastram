"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className={cn(
          "relative h-9 w-9 rounded-lg bg-muted flex items-center justify-center",
          className
        )}
        disabled
        aria-label="Loading theme"
      >
        <Sun className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";
  const currentTheme = theme === "system" ? "system" : isDark ? "dark" : "light";

  const cycleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        "relative h-9 w-9 rounded-lg bg-muted hover:bg-accent transition-all duration-300 flex items-center justify-center overflow-hidden group",
        className
      )}
      aria-label={`Current theme: ${currentTheme}. Click to change theme.`}
      title={`Theme: ${currentTheme}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentTheme}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ 
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1]
          }}
          className="absolute"
        >
          {currentTheme === "system" ? (
            <Monitor className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors duration-300" />
          ) : isDark ? (
            <Sun className="h-4 w-4 text-muted-foreground group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors duration-300" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors duration-300" />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
