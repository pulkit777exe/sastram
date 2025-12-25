"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Moon } from "lucide-react";
import { updateUserProfile } from "@/app/actions/user";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useState } from "react";

interface SettingsFormProps {
  user: {
    name: string | null;
    email: string;
  };
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
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

  async function handleSubmit(formData: FormData) {
    const result = await updateUserProfile(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Profile updated successfully!");
    }
  }

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-6"
    >
      <motion.div variants={item} className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Profile Information</h2>
            <p className="text-sm text-zinc-400">Update your public profile details.</p>
          </div>
        </div>
        
        <form action={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-zinc-300">Display Name</Label>
            <Input 
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl border-zinc-700 bg-[#161618] text-white focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-zinc-300">Email</Label>
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

      <motion.div variants={item} className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Notifications</h2>
            <p className="text-sm text-zinc-400">Configure how you receive alerts.</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifs" className="text-base font-medium text-white">Email Notifications</Label>
              <p className="text-sm text-zinc-400">Receive daily summaries of your subscribed topics.</p>
            </div>
            <Switch id="email-notifs" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-notifs" className="text-base font-medium text-white">Push Notifications</Label>
              <p className="text-sm text-zinc-400">Receive real-time alerts for mentions.</p>
            </div>
            <Switch id="push-notifs" />
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Appearance</h2>
            <p className="text-sm text-zinc-400">Customize the look and feel of the application.</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="dark-mode" className="text-base font-medium text-white">Dark Mode</Label>
            <p className="text-sm text-zinc-400">Toggle dark mode theme.</p>
          </div>
          <Switch id="dark-mode" defaultChecked />
        </div>
      </motion.div>
    </motion.div>
  );
}
