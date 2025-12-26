"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail } from "lucide-react";
import { inviteFriendToThread } from "@/modules/invitations/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface InviteFriendButtonProps {
  threadId: string;
  threadName: string;
}

export function InviteFriendButton({ threadId, threadName }: InviteFriendButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("threadId", threadId);
    formData.append("email", email.trim());
    if (message.trim()) {
      formData.append("message", message.trim());
    }

    const result = await inviteFriendToThread(formData);
    setIsSubmitting(false);

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Invitation sent successfully!");
      setEmail("");
      setMessage("");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-[#1C1C1E] border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Friend
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#1C1C1E] border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Invite a Friend</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Share this discussion thread with a friend via email
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-zinc-900/50 border-zinc-700 text-white placeholder:text-zinc-500"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message" className="text-zinc-300">
                Personal Message (Optional)
              </Label>
              <Textarea
                id="message"
                placeholder={`Check out this discussion: ${threadName}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-zinc-900/50 border-zinc-700 text-white placeholder:text-zinc-500 resize-none min-h-[100px]"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isSubmitting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

