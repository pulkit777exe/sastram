"use client";

import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Monitor, Bell, Mail, Sparkles } from "lucide-react";
import { updateUserPreferencesAction } from "@/modules/users/actions";
import { toasts } from "@/lib/utils/toast";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  parseUserPreferences,
  type UserPreferences,
} from "@/lib/schemas/user-preferences";

interface PreferencesFormProps {
  user: {
    preferences?: unknown;
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
  const initialPrefs = useMemo(
    () => parseUserPreferences(user.preferences),
    [user.preferences],
  );
  const [prefs, setPrefs] = useState<UserPreferences>(initialPrefs);

  async function updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) {
    const previous = prefs[key];
    const nextPrefs = { ...prefs, [key]: value };
    setPrefs(nextPrefs);

    if (key === "theme") {
      setNextTheme(value as "light" | "dark" | "system");
    }

    const result = await updateUserPreferencesAction({ [key]: value });
    if (result?.error) {
      setPrefs((prev) => ({ ...prev, [key]: previous }));
      if (key === "theme") {
        setNextTheme(previous as "light" | "dark" | "system");
      }
      toasts.serverError();
      return;
    }

    toasts.saved();
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
            <Select
              value={prefs.theme}
              onValueChange={(value) =>
                void updatePreference("theme", value as UserPreferences["theme"])
              }
            >
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
            <Select
              value={prefs.emailDigest}
              onValueChange={(value) =>
                void updatePreference(
                  "emailDigest",
                  value as UserPreferences["emailDigest"],
                )
              }
            >
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
              checked={prefs.pushEnabled}
              onCheckedChange={(enabled) =>
                void updatePreference("pushEnabled", enabled)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="mention-emails"
                className="text-base font-medium text-foreground"
              >
                @mention Emails
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive an email when someone mentions you.
              </p>
            </div>
            <Switch
              id="mention-emails"
              checked={prefs.mentionEmails}
              onCheckedChange={(enabled) =>
                void updatePreference("mentionEmails", enabled)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="reply-emails"
                className="text-base font-medium text-foreground"
              >
                Reply Emails
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive an email when someone replies to you.
              </p>
            </div>
            <Switch
              id="reply-emails"
              checked={prefs.replyEmails}
              onCheckedChange={(enabled) =>
                void updatePreference("replyEmails", enabled)
              }
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
              checked={prefs.aiSummaryEnabled}
              onCheckedChange={(enabled) =>
                void updatePreference("aiSummaryEnabled", enabled)
              }
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Privacy</h2>
            <p className="text-sm text-muted-foreground">
              Control visibility of your activity and presence.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="online-status"
                className="text-base font-medium text-foreground"
              >
                Show Online Status
              </Label>
              <p className="text-sm text-muted-foreground">
                Let others see when you are active.
              </p>
            </div>
            <Switch
              id="online-status"
              checked={prefs.showOnlineStatus}
              onCheckedChange={(enabled) =>
                void updatePreference("showOnlineStatus", enabled)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="public-activity"
                className="text-base font-medium text-foreground"
              >
                Public Activity Feed
              </Label>
              <p className="text-sm text-muted-foreground">
                Show your activity feed on your public profile.
              </p>
            </div>
            <Switch
              id="public-activity"
              checked={prefs.publicActivityFeed}
              onCheckedChange={(enabled) =>
                void updatePreference("publicActivityFeed", enabled)
              }
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
