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
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function ProfileView({ user }: ProfileViewProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div
        variants={item}
        className="flex flex-col items-center md:flex-row md:items-start gap-6 rounded-2xl border border-border bg-card p-8 shadow-xl"
      >
        <Avatar className="h-32 w-32 border-4 border-background shadow-2xl">
          <AvatarImage src={user.image || ""} />
          <AvatarFallback className="text-4xl bg-muted text-muted-foreground">
            {user.name?.[0] || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-2 text-center md:text-left pt-2">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {user.name}
          </h1>
          <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span className="text-sm">{user.email}</span>
          </div>
          <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-xs">
              Joined {format(new Date(user.createdAt), "MMMM yyyy")}
            </span>
          </div>
          <div className="pt-4">
            <span className="inline-flex items-center rounded-lg bg-indigo-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-500 border border-indigo-500/20">
              {user.role}
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid gap-4 md:grid-cols-2">
        <StatCard
          title="Total Messages"
          value={user._count.messages}
          icon={<MessageSquare size={18} />}
        />
        <StatCard
          title="Topics Created"
          value={user._count.sections}
          icon={<Hash size={18} />}
        />
      </motion.div>
    </motion.div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between pb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}
