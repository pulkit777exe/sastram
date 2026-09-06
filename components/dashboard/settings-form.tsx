'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { User, Bell, Upload, Image as ImageIcon, X, Shield } from 'lucide-react';
import {
  updateUserProfile,
  uploadAvatar,
  uploadBanner,
  updateProfilePrivacyAction,
  updateUserPreferencesAction,
} from '@/modules/users/actions';
import { useFormStatus } from 'react-dom';
import { toasts } from '@/lib/utils/toast';
import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';

const PRIVACY_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'FOLLOWERS_ONLY', label: 'Followers Only' },
  { value: 'PRIVATE', label: 'Private' },
] as const;

type ProfilePrivacyValue = (typeof PRIVACY_OPTIONS)[number]['value'];

interface SettingsFormProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    bio?: string | null;
    location?: string | null;
    website?: string | null;
    twitter?: string | null;
    github?: string | null;
    image?: string | null;
    bannerUrl?: string | null;
    profilePrivacy?: string;
    preferences?: unknown;
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full"
    >
      {pending ? 'Saving...' : 'Save Changes'}
    </Button>
  );
}

export function SettingsForm({ user }: SettingsFormProps) {
  const [name, setName] = useState(user.name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [location, setLocation] = useState(user.location || '');
  const [website, setWebsite] = useState(user.website || '');
  const [twitter, setTwitter] = useState(user.twitter || '');
  const [github, setGithub] = useState(user.github || '');
  const [avatarUrl, setAvatarUrl] = useState(user.image || '');
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [profilePrivacy, setProfilePrivacy] = useState(user.profilePrivacy || 'PUBLIC');
  const preferences = parseUserPreferences(user.preferences);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [emailNotifs, setEmailNotifs] = useState(() => {
    return preferences.emailDigest !== 'never';
  });
  const [pushNotifs, setPushNotifs] = useState(() => {
    return preferences.pushEnabled;
  });

  async function handleToggleEmail(enabled: boolean) {
    const previous = emailNotifs;
    setEmailNotifs(enabled);
    const result = await updateUserPreferencesAction({
      emailDigest: enabled ? 'daily' : 'never',
    });
    if (result?.error) {
      setEmailNotifs(previous);
      toasts.serverError();
      return;
    }
    toasts.saved();
  }

  async function handleTogglePush(enabled: boolean) {
    const previous = pushNotifs;
    setPushNotifs(enabled);
    const result = await updateUserPreferencesAction({
      pushEnabled: enabled,
    });
    if (result?.error) {
      setPushNotifs(previous);
      toasts.serverError();
      return;
    }
    toasts.saved();
  }

  async function handleUpdatePrivacy(privacy: ProfilePrivacyValue) {
    const previous = profilePrivacy;
    setProfilePrivacy(privacy);
    const result = await updateProfilePrivacyAction({ privacy });
    if (result?.error) {
      setProfilePrivacy(previous);
      toasts.serverError();
      return;
    }
    toasts.saved();
  }

  async function handleSubmit(formData: FormData) {
    const result = await updateUserProfile(formData);
    if (result?.error) {
      toasts.serverError();
    } else {
      toasts.saved();
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadAvatar(formData);
    if (result?.error) {
      toasts.error(result.error);
    } else if (result?.data?.url) {
      setAvatarUrl(result.data.url);
      toasts.saved();
    }
    setUploadingAvatar(false);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBanner(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadBanner(formData);
    if (result?.error) {
      toasts.error(result.error);
    } else if (result?.data?.url) {
      setBannerUrl(result.data.url);
      toasts.saved();
    }
    setUploadingBanner(false);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = '';
    }
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Profile Information</h2>
            <p className="text-sm text-muted-foreground">Update your public profile details.</p>
          </div>
        </div>

        <form action={handleSubmit} className="space-y-4">
          {/* Avatar Upload */}
          <div className="grid gap-2">
            <Label className="text-ink">Profile Picture</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-line">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-2xl bg-field text-ink-3">
                  {user.name?.[0] || user.email[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  id="avatar-upload"
                  disabled={uploadingAvatar}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? (
                    'Uploading...'
                  ) : (
                    <>
                      <Upload size={14} className="mr-2" />
                      Upload Avatar
                    </>
                  )}
                </Button>
                <p className="text-xs text-ink-3">JPG, PNG, GIF or WebP. Max 4.5MB</p>
              </div>
            </div>
          </div>

          {/* Banner Upload */}
          <div className="grid gap-2">
            <Label className="text-ink">Banner Image</Label>
            <div className="relative">
              {bannerUrl ? (
                <div className="relative h-32 w-full rounded-card overflow-hidden border border-line">
                  <Image
                    src={bannerUrl}
                    alt="Banner"
                    className="w-full h-full object-cover"
                    width={800}
                    height={200}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => setBannerUrl('')}
                    className="absolute top-2 right-2"
                  >
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <div className="h-32 w-full rounded-card border-2 border-dashed border-line flex items-center justify-center bg-field/50">
                  <div className="text-center">
                    <ImageIcon className="h-8 w-8 text-ink-3 mx-auto mb-2" />
                    <p className="text-sm text-ink-3">No banner image</p>
                  </div>
                </div>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                className="hidden"
                id="banner-upload"
                disabled={uploadingBanner}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                className="mt-2"
              >
                {uploadingBanner ? (
                  'Uploading...'
                ) : (
                  <>
                    <Upload size={14} className="mr-2" />
                    {bannerUrl ? 'Change Banner' : 'Upload Banner'}
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name" className="text-ink">
              Display Name
            </Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio" className="text-ink">
              Bio
            </Label>
            <Textarea
              id="bio"
              name="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              className="resize-none"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location" className="text-ink">
              Location
            </Label>
            <Input
              id="location"
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
              className="h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="website" className="text-ink">
              Website
            </Label>
            <Input
              id="website"
              name="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="twitter" className="text-ink">
              Twitter
            </Label>
            <Input
              id="twitter"
              name="twitter"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@username"
              className="h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="github" className="text-ink">
              GitHub
            </Label>
            <Input
              id="github"
              name="github"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="username"
              className="h-11 rounded-card border-line bg-background text-ink focus-visible:ring-2 focus-visible:ring-brand/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-ink">
              Email
            </Label>
            <Input
              id="email"
              defaultValue={user.email}
              disabled
              className="h-11 rounded-card border-line bg-field/50 text-ink-3 opacity-70"
            />
          </div>
          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Notifications</h2>
            <p className="text-sm text-ink-3">Configure how you receive alerts.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifs" className="text-base font-medium text-ink">
                Email Notifications
              </Label>
              <p className="text-sm text-ink-3">
                Receive daily summaries of your subscribed topics.
              </p>
            </div>
            <Switch id="settings-email-notifs" checked={emailNotifs} onCheckedChange={handleToggleEmail} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-push-notifs" className="text-base font-medium text-ink">
                Push Notifications
              </Label>
              <p className="text-sm text-ink-3">
                Receive real-time alerts for mentions.
              </p>
            </div>
            <Switch id="settings-push-notifs" checked={pushNotifs} onCheckedChange={handleTogglePush} />
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-linear-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand/10 text-brand">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Profile Privacy</h2>
            <p className="text-sm text-ink-3">
              Control who can view your profile and activity.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            <Label className="text-base font-medium text-ink">Privacy Level</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PRIVACY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={profilePrivacy === option.value ? 'default' : 'outline'}
                  onClick={() => void handleUpdatePrivacy(option.value)}
                  className="h-10"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="text-sm text-ink-3">
              {profilePrivacy === 'PUBLIC' && 'Your profile is visible to everyone.'}
              {profilePrivacy === 'PRIVATE' && 'Only you can view your profile.'}
              {profilePrivacy === 'FOLLOWERS_ONLY' && 'Only your followers can view your profile.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
