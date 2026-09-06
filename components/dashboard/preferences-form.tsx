'use client';

import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Sun, Moon, Monitor, Bell, Mail, Sparkles, Shield } from 'lucide-react';
import { updateUserPreferencesAction } from '@/modules/users/actions';
import { toasts } from '@/lib/utils/toast';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { parseUserPreferences, type UserPreferences } from '@/lib/schemas/user-preferences';

interface PreferencesFormProps {
  user: {
    preferences?: unknown;
  };
}

export function PreferencesForm({ user }: PreferencesFormProps) {
  const { setTheme: setNextTheme } = useTheme();
  const initialPrefs = parseUserPreferences(user.preferences);
  const [prefs, setPrefs] = useState<UserPreferences>(initialPrefs);

  async function updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) {
    const previous = prefs[key];
    const nextPrefs = { ...prefs, [key]: value };
    setPrefs(nextPrefs);

    if (key === 'theme') {
      setNextTheme(value as 'light' | 'dark' | 'system');
    }

    const result = await updateUserPreferencesAction({ [key]: value });
    if (result?.error) {
      setPrefs((prev) => ({ ...prev, [key]: previous }));
      if (key === 'theme') {
        setNextTheme(previous as 'light' | 'dark' | 'system');
      }
      toasts.serverError();
      return;
    }

    toasts.saved();
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Appearance</h2>
            <p className="text-sm text-ink-3">Customize how the app looks and feels.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            <Label className="text-base font-medium text-ink">Theme</Label>
            <Select
              value={prefs.theme}
              onValueChange={(value) =>
                void updatePreference('theme', value as UserPreferences['theme'])
              }
            >
              <SelectTrigger className="w-full h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all">
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
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Email Notifications</h2>
            <p className="text-sm text-ink-3">
              Configure how often you receive email updates.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            <Label className="text-base font-medium text-ink">Digest Frequency</Label>
            <Select
              value={prefs.emailDigest}
              onValueChange={(value) =>
                void updatePreference('emailDigest', value as UserPreferences['emailDigest'])
              }
            >
              <SelectTrigger className="w-full h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all">
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
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
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
              <Label htmlFor="push-notifs" className="text-base font-medium text-foreground">
                Enable Push Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified for mentions and replies.
              </p>
            </div>
            <Switch
              id="push-notifs"
              checked={prefs.pushEnabled}
              onCheckedChange={(enabled) => void updatePreference('pushEnabled', enabled)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="mention-emails" className="text-base font-medium text-foreground">
                @mention Emails
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive an email when someone mentions you.
              </p>
            </div>
            <Switch
              id="mention-emails"
              checked={prefs.mentionEmails}
              onCheckedChange={(enabled) => void updatePreference('mentionEmails', enabled)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reply-emails" className="text-base font-medium text-foreground">
                Reply Emails
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive an email when someone replies to you.
              </p>
            </div>
            <Switch
              id="reply-emails"
              checked={prefs.replyEmails}
              onCheckedChange={(enabled) => void updatePreference('replyEmails', enabled)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Sai Features</h2>
            <p className="text-sm text-muted-foreground">Configure Sai-powered features.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ai-summary" className="text-base font-medium text-foreground">
                Sai Summaries
              </Label>
              <p className="text-sm text-muted-foreground">
                Get Sai-generated summaries of long threads.
              </p>
            </div>
            <Switch
              id="ai-summary"
              checked={prefs.aiSummaryEnabled}
              onCheckedChange={(enabled) => void updatePreference('aiSummaryEnabled', enabled)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Shield className="h-5 w-5" />
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
              <Label htmlFor="public-activity" className="text-base font-medium text-foreground">
                Public Activity Feed
              </Label>
              <p className="text-sm text-muted-foreground">
                Show your activity feed on your public profile.
              </p>
            </div>
            <Switch
              id="public-activity"
              checked={prefs.publicActivityFeed}
              onCheckedChange={(enabled) => void updatePreference('publicActivityFeed', enabled)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Research Personalization</h2>
            <p className="text-sm text-muted-foreground">Tune Sai to your depth and workflow.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            <Label className="text-base font-medium text-foreground">Expertise Level</Label>
            <Select
              value={prefs.expertiseLevel ?? 'intermediate'}
              onValueChange={(value) => void updatePreference('expertiseLevel' as keyof UserPreferences, value as UserPreferences['expertiseLevel'])}
            >
              <SelectTrigger className="w-full h-11 rounded-card border-line bg-background">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner — ELI5</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Sai adjusts synthesis depth. Auto-inferred from your threads, override here.</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Deep Research</Label>
              <p className="text-sm text-muted-foreground">Enable 3-5 min async 20+ source research.</p>
            </div>
            <Switch checked={(prefs as unknown as { deepResearchEnabled?: boolean }).deepResearchEnabled ?? true} onCheckedChange={(v) => void updatePreference('deepResearchEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Collections</Label>
              <p className="text-sm text-muted-foreground">Save threads + searches into workspaces.</p>
            </div>
            <Switch checked={(prefs as unknown as { collectionsEnabled?: boolean }).collectionsEnabled ?? true} onCheckedChange={(v) => void updatePreference('collectionsEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Graph Explorer</Label>
              <p className="text-sm text-muted-foreground">Show semantic thread graph.</p>
            </div>
            <Switch checked={(prefs as unknown as { graphEnabled?: boolean }).graphEnabled ?? true} onCheckedChange={(v) => void updatePreference('graphEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Source Provenance</Label>
              <p className="text-sm text-muted-foreground">Show tier, freshness, confidence in drawer.</p>
            </div>
            <Switch checked={(prefs as unknown as { sourceProvenanceEnabled?: boolean }).sourceProvenanceEnabled ?? true} onCheckedChange={(v) => void updatePreference('sourceProvenanceEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Resolution Engine</h2>
            <p className="text-sm text-muted-foreground">Control verified resolution and decay.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Verified Resolution</Label>
              <p className="text-sm text-muted-foreground">Allow OP/admin to mark threads verified.</p>
            </div>
            <Switch checked={(prefs as unknown as { verifiedResolutionEnabled?: boolean }).verifiedResolutionEnabled ?? true} onCheckedChange={(v) => void updatePreference('verifiedResolutionEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Confidence Decay Timeline</Label>
              <p className="text-sm text-muted-foreground">Show effective score sparkline.</p>
            </div>
            <Switch checked={(prefs as unknown as { confidenceDecayEnabled?: boolean }).confidenceDecayEnabled ?? true} onCheckedChange={(v) => void updatePreference('confidenceDecayEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium text-foreground">Challenge Mode</Label>
              <p className="text-sm text-muted-foreground">Allow counter-source challenges.</p>
            </div>
            <Switch checked={(prefs as unknown as { challengeModeEnabled?: boolean }).challengeModeEnabled ?? true} onCheckedChange={(v) => void updatePreference('challengeModeEnabled' as keyof UserPreferences, v as unknown as UserPreferences[keyof UserPreferences])} />
          </div>
        </div>
      </div>
    </div>
  );
}
