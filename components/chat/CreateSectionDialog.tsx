"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

interface CreateSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSectionDialog({ open, onOpenChange }: CreateSectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-[28px] border-zinc-200 p-8">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mb-2">
            <Plus className="text-zinc-900" size={24} />
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight text-zinc-900">
            Create Section
          </DialogTitle>
          <DialogDescription className="text-zinc-500 font-medium">
            Organize your community with a new dedicated channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1">Title</Label>
            <Input 
              className="h-12 rounded-xl bg-zinc-50 border-zinc-200 focus:bg-white transition-all font-medium" 
              placeholder="e.g. Design Feedback"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1">Purpose</Label>
            <Textarea 
              className="rounded-xl bg-zinc-50 border-zinc-200 focus:bg-white transition-all min-h-[100px] resize-none font-medium" 
              placeholder="What should people post here?"
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold text-zinc-500">
            Cancel
          </Button>
          <Button className="bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl px-8 h-11 font-bold shadow-lg shadow-zinc-200 transition-all active:scale-95">
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}