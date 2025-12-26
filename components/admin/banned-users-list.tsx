"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Ban, Unlock, Calendar, AlertTriangle } from "lucide-react";
import { unbanUser } from "@/modules/moderation/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useState } from "react";

interface BannedUser {
  id: string;
  userId: string;
  bannedBy: string;
  reason: string;
  customReason: string | null;
  threadId: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    status: string;
  };
  issuer: {
    id: string;
    name: string | null;
    email: string;
  };
  thread: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface BannedUsersListProps {
  bans: BannedUser[];
}

export function BannedUsersList({ bans }: BannedUsersListProps) {
  const router = useRouter();
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  async function handleUnban(banId: string) {
    setUnbanningId(banId);
    const result = await unbanUser(banId);
    
    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("User unbanned successfully");
      router.refresh();
    }
    setUnbanningId(null);
  }

  if (bans.length === 0) {
    return (
      <Card className="border-zinc-800 bg-[#1C1C1E]">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400">No banned users found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bans.map((ban) => (
        <Card key={ban.id} className="border-zinc-800 bg-[#1C1C1E]">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <Avatar className="h-12 w-12 border-2 border-red-500/20">
                  <AvatarImage src={ban.user.image || ""} />
                  <AvatarFallback className="bg-red-500/10 text-red-400">
                    {ban.user.name?.[0] || ban.user.email[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">
                      {ban.user.name || ban.user.email}
                    </h3>
                    <Badge variant="destructive" className="text-xs">
                      BANNED
                    </Badge>
                    {ban.threadId && (
                      <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-400">
                        Thread Only
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400">{ban.user.email}</p>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Ban className="h-3 w-3 text-red-400" />
                      <span className="text-zinc-300">
                        <span className="font-medium">Reason:</span>{" "}
                        <span className="text-red-400">{ban.reason}</span>
                      </span>
                    </div>
                    {ban.customReason && (
                      <p className="text-sm text-zinc-500 ml-5">{ban.customReason}</p>
                    )}
                    {ban.thread && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400 ml-5">
                        <span>Thread: {ban.thread.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-zinc-500 ml-5">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Banned {format(new Date(ban.createdAt), "MMM d, yyyy")}</span>
                      </div>
                      {ban.expiresAt && (
                        <div className="flex items-center gap-1">
                          <span>Expires: {format(new Date(ban.expiresAt), "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {!ban.expiresAt && (
                        <span className="text-red-400">Permanent</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-600 ml-5">
                      Banned by: {ban.issuer.name || ban.issuer.email}
                    </div>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUnban(ban.id)}
                disabled={unbanningId === ban.id}
                className="border-green-500/50 text-green-400 hover:bg-green-500/10"
              >
                {unbanningId === ban.id ? (
                  "Unbanning..."
                ) : (
                  <>
                    <Unlock className="h-4 w-4 mr-2" />
                    Unban
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

