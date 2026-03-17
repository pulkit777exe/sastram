"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Monitor, Bell, Mail, Sparkles } from "lucide-react";
import { updateUserPreferencesAction } from "@/modules/users/actions";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

interface PreferencesFormProps {
  user: {
    preferences?: any;
  };
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function PreferencesForm({ user }: PreferencesFormProps) {
  const { setTheme: setNextTheme } = useTheme();
  const [theme, setTheme] = useState(user.preferences?.theme || "system");
  const [emailDigest, setEmailDigest] = useState(user.preferences?.emailDigest || "daily");
  const [pushEnabled, setPushEnabled] = useState(!!user.preferences?.pushEnabled);
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(!!user.preferences?.aiSummaryEnabled);

  async function handleUpdateTheme(newTheme: string) {
    setTheme(newTheme);
    setNextTheme(newTheme);
    const result = await updateUserPreferencesAction({ theme: newTheme });
    if (result?.error) toast.error(result.error);
    else toast.success("Theme preferences updated!");
  }

  async function handleUpdateEmailDigest(frequency: string) {
    setEmailDigest(frequency);
    const result = await updateUserPreferencesAction({ emailDigest: frequency });
    if (result?.error) toast.error(result.error);
    else toast.success("Email preferences updated!");
  }

  async function handleUpdatePush(enabled: boolean) {
    setPushEnabled(enabled);
    const result = await updateUserPreferencesAction({ pushEnabled: enabled });
    if (result?.error) toast.error(result.error);
    else toast.success("Push preferences updated!");
  }

  async function handleUpdateAiSummary(enabled: boolean) {
    setAiSummaryEnabled(enabled);
    const result = await updateUserPreferencesAction({ aiSummaryEnabled: enabled });
    if (result?.error) toast.error(result.error);
    else toast.success("AI summary preferences updated!");
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-6"
    >
      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Appearance</h2>
            <p className="text-sm text-muted-foreground">
              Customize how the app looks and feels.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            <Label className="text-base font-medium text-foreground">
              Theme
            </Label>
            <Select value={theme} onValueChange={handleUpdateTheme}>
              <SelectTrigger className="w-full h-11 rounded-xl border-border bg-background text-foreground focus:ring-2 focus:ring-indigo-500/50 transition-all">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun size={16} />
                    <span>Light</span>
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon size={16} />
                    <span>Dark</span>
                  </div>
                </SelectItem>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <Monitor size={16} />
                    <span>System Default</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Email Notifications</h2>
            <p className="text-sm text-muted-foreground">
              Configure how often you receive email updates.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            <Label className="text-base font-medium text-foreground">
              Digest Frequency
            </Label>
            <Select value={emailDigest} onValueChange={handleUpdateEmailDigest}>
              <SelectTrigger className="w-full h-11 rounded-xl border-border bg-background text-foreground focus:ring-2 focus:ring-indigo-500/50 transition-all">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Push Notifications</h2>
            <p className="text-sm text-muted-foreground">
              Receive real-time alerts for important events.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="push-notifs"
                className="text-base font-medium text-foreground"
              >
                Enable Push Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified for mentions and replies.
              </p>
            </div>
            <Switch
              id="push-notifs"
              checked={pushEnabled}
              onCheckedChange={handleUpdatePush}
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">AI Features</h2>
            <p className="text-sm text-muted-foreground">
              Configure AI-powered features.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="ai-summary"
                className="text-base font-medium text-foreground"
              >
                AI Summaries
              </Label>
              <p className="text-sm text-muted-foreground">
                Get AI-generated summaries of long threads.
              </p>
            </div>
            <Switch
              id="ai-summary"
              checked={aiSummaryEnabled}
              onCheckedChange={handleUpdateAiSummary}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
