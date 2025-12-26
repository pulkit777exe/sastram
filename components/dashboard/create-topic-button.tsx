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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { createTopic } from "@/modules/topics/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function CreateTopicButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await createTopic(formData);
    setLoading(false);

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Topic created successfully!");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-white text-black hover:bg-zinc-200 rounded-lg font-semibold">
          New Thread
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#161618] border-zinc-800 text-white sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Create New Topic
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Start a new discussion thread. It will appear on the global feed.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-zinc-400">
              Title
            </Label>
            <Input
              id="title"
              name="title"
              className="bg-[#1C1C1E] border-zinc-800 text-white focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-400">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              className="bg-[#1C1C1E] border-zinc-800 text-white focus:ring-indigo-500 min-h-[100px]"
              required
            />
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Create Topic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
