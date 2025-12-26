"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Ban, AlertTriangle, Users, MessageSquare } from "lucide-react";
import { deleteThread, deleteCommunity, banUser } from "@/modules/moderation/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { ThreadSummary } from "@/modules/threads/types";
import type { CommunitySummary } from "@/modules/communities/types";

interface AdminModerationPanelProps {
  threads: ThreadSummary[];
  communities: CommunitySummary[];
}

export function AdminModerationPanel({ threads, communities }: AdminModerationPanelProps) {
  const router = useRouter();
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [deleteThreadDialogOpen, setDeleteThreadDialogOpen] = useState(false);
  const [deleteCommunityDialogOpen, setDeleteCommunityDialogOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<string>("");
  const [selectedCommunity, setSelectedCommunity] = useState<string>("");
  const [banReason, setBanReason] = useState<string>("");
  const [banCustomReason, setBanCustomReason] = useState<string>("");
  const [banUserId, setBanUserId] = useState<string>("");
  const [banThreadId, setBanThreadId] = useState<string>("");
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleBanUser() {
    if (!banUserId || !banReason) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    const result = await banUser(
      banUserId,
      banReason,
      banCustomReason || undefined,
      banThreadId || undefined
    );

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("User banned successfully");
      setBanDialogOpen(false);
      setBanUserId("");
      setBanThreadId("");
      setBanReason("");
      setBanCustomReason("");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDeleteThread() {
    if (!selectedThread) {
      toast.error("Please select a thread");
      return;
    }

    setLoading(true);
    const result = await deleteThread(selectedThread, deleteReason || undefined);

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Thread deleted successfully");
      setDeleteThreadDialogOpen(false);
      setSelectedThread("");
      setDeleteReason("");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDeleteCommunity() {
    if (!selectedCommunity) {
      toast.error("Please select a community");
      return;
    }

    setLoading(true);
    const result = await deleteCommunity(selectedCommunity, deleteReason || undefined);

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Community deleted successfully");
      setDeleteCommunityDialogOpen(false);
      setSelectedCommunity("");
      setDeleteReason("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border-zinc-800 bg-[#1C1C1E]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-400" />
            Ban User
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400 mb-4">
            Ban a user from a specific thread or the entire platform.
          </p>
          <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Ban className="h-4 w-4 mr-2" />
                Ban User
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1C1C1E] border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle>Ban User</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Enter user ID and select ban reason. You can ban from a specific thread or globally.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="ban-user-id">User ID</Label>
                  <Input
                    id="ban-user-id"
                    value={banUserId}
                    onChange={(e) => setBanUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="bg-[#161618] border-zinc-700 text-white"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ban-thread">Thread (Optional - leave empty for global ban)</Label>
                  <Select value={banThreadId} onValueChange={setBanThreadId}>
                    <SelectTrigger className="bg-[#161618] border-zinc-700 text-white">
                      <SelectValue placeholder="Select thread (optional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C1C1E] border-zinc-800">
                      <SelectItem value="">Global Ban</SelectItem>
                      {threads.map((thread) => (
                        <SelectItem key={thread.id} value={thread.id}>
                          {thread.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ban-reason">Ban Reason</Label>
                  <Select value={banReason} onValueChange={setBanReason}>
                    <SelectTrigger className="bg-[#161618] border-zinc-700 text-white">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C1C1E] border-zinc-800">
                      <SelectItem value="SPAM">Spam</SelectItem>
                      <SelectItem value="HARASSMENT">Harassment</SelectItem>
                      <SelectItem value="HATE_SPEECH">Hate Speech</SelectItem>
                      <SelectItem value="ILLEGAL_CONTENT">Illegal Content</SelectItem>
                      <SelectItem value="IMPERSONATION">Impersonation</SelectItem>
                      <SelectItem value="THREATS">Threats</SelectItem>
                      <SelectItem value="DOXXING">Doxxing</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ban-custom-reason">Custom Reason (Optional)</Label>
                  <Textarea
                    id="ban-custom-reason"
                    value={banCustomReason}
                    onChange={(e) => setBanCustomReason(e.target.value)}
                    placeholder="Additional details..."
                    rows={3}
                    className="bg-[#161618] border-zinc-700 text-white resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBanDialogOpen(false)}
                  className="border-zinc-700 text-zinc-300"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBanUser}
                  disabled={loading || !banUserId || !banReason}
                >
                  {loading ? "Banning..." : "Ban User"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-[#1C1C1E]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-400" />
            Delete Thread
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400 mb-4">
            Permanently delete a thread and all its messages.
          </p>
          <Dialog open={deleteThreadDialogOpen} onOpenChange={setDeleteThreadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Thread
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1C1C1E] border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle>Delete Thread</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  This action cannot be undone. All messages in this thread will be deleted.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="delete-thread">Select Thread</Label>
                  <Select value={selectedThread} onValueChange={setSelectedThread}>
                    <SelectTrigger className="bg-[#161618] border-zinc-700 text-white">
                      <SelectValue placeholder="Select thread to delete" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C1C1E] border-zinc-800">
                      {threads.map((thread) => (
                        <SelectItem key={thread.id} value={thread.id}>
                          {thread.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="delete-thread-reason">Reason (Optional)</Label>
                  <Textarea
                    id="delete-thread-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Reason for deletion..."
                    rows={3}
                    className="bg-[#161618] border-zinc-700 text-white resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteThreadDialogOpen(false)}
                  className="border-zinc-700 text-zinc-300"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteThread}
                  disabled={loading || !selectedThread}
                >
                  {loading ? "Deleting..." : "Delete Thread"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-[#1C1C1E]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-400" />
            Delete Community
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400 mb-4">
            Permanently delete a community and all its threads.
          </p>
          <Dialog open={deleteCommunityDialogOpen} onOpenChange={setDeleteCommunityDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Community
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1C1C1E] border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle>Delete Community</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  This action cannot be undone. All threads in this community will be deleted.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="delete-community">Select Community</Label>
                  <Select value={selectedCommunity} onValueChange={setSelectedCommunity}>
                    <SelectTrigger className="bg-[#161618] border-zinc-700 text-white">
                      <SelectValue placeholder="Select community to delete" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C1C1E] border-zinc-800">
                      {communities.map((community) => (
                        <SelectItem key={community.id} value={community.id}>
                          {community.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="delete-community-reason">Reason (Optional)</Label>
                  <Textarea
                    id="delete-community-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Reason for deletion..."
                    rows={3}
                    className="bg-[#161618] border-zinc-700 text-white resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteCommunityDialogOpen(false)}
                  className="border-zinc-700 text-zinc-300"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteCommunity}
                  disabled={loading || !selectedCommunity}
                >
                  {loading ? "Deleting..." : "Delete Community"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

