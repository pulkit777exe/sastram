"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="relative h-9 w-9 rounded-lg bg-zinc-800/50 flex items-center justify-center"
        disabled
      >
        <Sun className="h-4 w-4 text-zinc-400" />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative h-9 w-9 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 dark:hover:bg-zinc-700/50 transition-all duration-300 flex items-center justify-center overflow-hidden group"
      aria-label="Toggle theme"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isDark ? "dark" : "light"}
          initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.8 }}
          transition={{ 
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1]
          }}
          className="absolute"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-zinc-400 group-hover:text-yellow-400 transition-colors duration-300" />
          ) : (
            <Moon className="h-4 w-4 text-zinc-600 group-hover:text-indigo-400 transition-colors duration-300" />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
