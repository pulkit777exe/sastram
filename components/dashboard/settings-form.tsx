"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Moon, Upload, Image as ImageIcon, X } from "lucide-react";
import { updateUserProfile, uploadAvatar, uploadBanner } from "@/modules/users/actions";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";

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
    linkedin?: string | null;
    image?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/40 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save Changes"}
    </Button>
  );
}

export function SettingsForm({ user }: SettingsFormProps) {
  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [location, setLocation] = useState(user.location || "");
  const [website, setWebsite] = useState(user.website || "");
  const [twitter, setTwitter] = useState(user.twitter || "");
  const [github, setGithub] = useState(user.github || "");
  const [linkedin, setLinkedin] = useState(user.linkedin || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || user.image || "");
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(formData: FormData) {
    const result = await updateUserProfile(formData);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Profile updated successfully!");
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("avatar", file);
    
    const result = await uploadAvatar(formData);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "url" in result && result.url) {
      setAvatarUrl(result.url);
      toast.success("Avatar uploaded successfully!");
    }
    setUploadingAvatar(false);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBanner(true);
    const formData = new FormData();
    formData.append("banner", file);
    
    const result = await uploadBanner(formData);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "url" in result && result.url) {
      setBannerUrl(result.url);
      toast.success("Banner uploaded successfully!");
    }
    setUploadingBanner(false);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = "";
    }
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
        className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Profile Information
            </h2>
            <p className="text-sm text-zinc-400">
              Update your public profile details.
            </p>
          </div>
        </div>

        <form action={handleSubmit} className="space-y-4">
          {/* Avatar Upload */}
          <div className="grid gap-2">
            <Label className="text-zinc-300">Profile Picture</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-zinc-700">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="text-2xl bg-zinc-800 text-zinc-400">
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
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  {uploadingAvatar ? (
                    "Uploading..."
                  ) : (
                    <>
                      <Upload size={14} className="mr-2" />
                      Upload Avatar
                    </>
                  )}
                </Button>
                <p className="text-xs text-zinc-500">JPG, PNG, GIF or WebP. Max 4.5MB</p>
              </div>
            </div>
          </div>

          {/* Banner Upload */}
          <div className="grid gap-2">
            <Label className="text-zinc-300">Banner Image</Label>
            <div className="relative">
              {bannerUrl ? (
                <div className="relative h-32 w-full rounded-xl overflow-hidden border border-zinc-700">
                  <Image src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setBannerUrl("")}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="h-32 w-full rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center bg-[#161618]">
                  <div className="text-center">
                    <ImageIcon className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No banner image</p>
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
                size="sm"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                className="mt-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                {uploadingBanner ? (
                  "Uploading..."
                ) : (
                  <>
                    <Upload size={14} className="mr-2" />
                    {bannerUrl ? "Change Banner" : "Upload Banner"}
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name" className="text-zinc-300">
              Display Name
            </Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio" className="text-zinc-300">
              Bio
            </Label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              className="w-full rounded-xl border border-zinc-700 bg-[#161618] text-white px-3 py-2 focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location" className="text-zinc-300">
              Location
            </Label>
            <Input
              id="location"
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="website" className="text-zinc-300">
              Website
            </Label>
            <Input
              id="website"
              name="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="twitter" className="text-zinc-300">
              Twitter
            </Label>
            <Input
              id="twitter"
              name="twitter"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@username"
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="github" className="text-zinc-300">
              GitHub
            </Label>
            <Input
              id="github"
              name="github"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="username"
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="linkedin" className="text-zinc-300">
              LinkedIn
            </Label>
            <Input
              id="linkedin"
              name="linkedin"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="username"
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-zinc-300">
              Email
            </Label>
            <Input
              id="email"
              defaultValue={user.email}
              disabled
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-zinc-500 opacity-70"
            />
          </div>
          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>
      </motion.div>

      <motion.div
        variants={item}
        className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Notifications</h2>
            <p className="text-sm text-zinc-400">
              Configure how you receive alerts.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="email-notifs"
                className="text-base font-medium text-white"
              >
                Email Notifications
              </Label>
              <p className="text-sm text-zinc-400">
                Receive daily summaries of your subscribed topics.
              </p>
            </div>
            <Switch id="email-notifs" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="push-notifs"
                className="text-base font-medium text-white"
              >
                Push Notifications
              </Label>
              <p className="text-sm text-zinc-400">
                Receive real-time alerts for mentions.
              </p>
            </div>
            <Switch id="push-notifs" />
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Appearance</h2>
            <p className="text-sm text-zinc-400">
              Customize the look and feel of the application.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="dark-mode"
              className="text-base font-medium text-white"
            >
              Dark Mode
            </Label>
            <p className="text-sm text-zinc-400">Toggle dark mode theme.</p>
          </div>
          <Switch id="dark-mode" defaultChecked />
        </div>
      </motion.div>
    </motion.div>
  );
}
