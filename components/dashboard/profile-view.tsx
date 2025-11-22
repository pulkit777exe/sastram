"use client";

import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Hash, Calendar, Mail } from "lucide-react";
import { format } from "date-fns";

interface ProfileViewProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    createdAt: Date;
    _count: {
      messages: number;
      sections: number;
    };
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

export function ProfileView({ user }: ProfileViewProps) {
  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={item} className="flex flex-col items-center md:flex-row md:items-start gap-6 rounded-xl border border-slate-100 bg-white p-8 shadow-sm">
        <Avatar className="h-32 w-32 border-4 border-white shadow-lg ring-1 ring-slate-100">
          <AvatarImage src={user.image || ""} />
          <AvatarFallback className="text-4xl bg-blue-50 text-blue-600">{user.name?.[0] || "U"}</AvatarFallback>
        </Avatar>
        <div className="space-y-2 text-center md:text-left pt-2">
          <h1 className="text-3xl font-bold text-slate-900">{user.name}</h1>
          <div className="flex items-center justify-center md:justify-start gap-2 text-slate-500">
            <Mail className="h-4 w-4" />
            <span>{user.email}</span>
          </div>
          <div className="flex items-center justify-center md:justify-start gap-2 text-slate-500">
            <Calendar className="h-4 w-4" />
            <span>Joined {format(new Date(user.createdAt), "MMMM yyyy")}</span>
          </div>
          <div className="pt-4">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              {user.role}
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-sm font-medium text-slate-500">Total Messages</h3>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{user._count.messages}</div>
          <p className="text-xs text-slate-400 mt-1">
            Contributions to discussions
          </p>
        </div>
        
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-sm font-medium text-slate-500">Topics Created</h3>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Hash className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{user._count.sections}</div>
          <p className="text-xs text-slate-400 mt-1">
            Communities started
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
