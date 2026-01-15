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

export function InviteFriendButton({
  threadId,
  threadName,
}: InviteFriendButtonProps) {
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
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Friend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite a Friend</DialogTitle>
          <DialogDescription>
            Share this discussion thread with a friend via email
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Personal Message (Optional)</Label>
              <Textarea
                id="message"
                placeholder={`Check out this discussion: ${threadName}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none min-h-[100px]"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
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
