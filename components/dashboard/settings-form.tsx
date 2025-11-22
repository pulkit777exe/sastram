"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Moon } from "lucide-react";

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

export function SettingsForm({ user }: SettingsFormProps) {
  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-6"
    >
      <motion.div variants={item} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Profile Information</h2>
            <p className="text-sm text-slate-500">Update your public profile details.</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Display Name</Label>
            <Input 
              id="name" 
              defaultValue={user.name || ""} 
              className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              defaultValue={user.email} 
              disabled 
              className="h-11 rounded-xl border-slate-200 bg-slate-50 opacity-70"
            />
          </div>
          <div className="pt-2">
            <Button className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/40">
              Save Changes
            </Button>
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
            <p className="text-sm text-slate-500">Configure how you receive alerts.</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifs" className="text-base font-medium text-slate-900">Email Notifications</Label>
              <p className="text-sm text-slate-500">Receive daily summaries of your subscribed topics.</p>
            </div>
            <Switch id="email-notifs" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-notifs" className="text-base font-medium text-slate-900">Push Notifications</Label>
              <p className="text-sm text-slate-500">Receive real-time alerts for mentions.</p>
            </div>
            <Switch id="push-notifs" />
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Appearance</h2>
            <p className="text-sm text-slate-500">Customize the look and feel of the application.</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="dark-mode" className="text-base font-medium text-slate-900">Dark Mode</Label>
            <p className="text-sm text-slate-500">Toggle dark mode theme.</p>
          </div>
          <Switch id="dark-mode" />
        </div>
      </motion.div>
    </motion.div>
  );
}
