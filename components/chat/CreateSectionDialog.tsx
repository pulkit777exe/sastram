"use client";

import { useState } from "react";
import { useCreateConversation } from "@/hooks/useConversations";
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
import { Loader2 } from "lucide-react";

interface CreateSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSectionDialog({
  open,
  onOpenChange,
}: CreateSectionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createConversation = useCreateConversation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;

    createConversation.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type: "channel"
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onOpenChange(false);
        },
      }
    );
  };

  const handleClose = () => {
    if (!createConversation.isPending) {
      setName("");
      setDescription("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Section</DialogTitle>
            <DialogDescription>
              Create a new discussion section for your forum. Give it a clear
              name and optional description.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Section Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., General Discussion"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createConversation.isPending}
                maxLength={50}
                required
              />
              <p className="text-xs text-muted-foreground">
                {name.length}/50 characters
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="What is this section about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createConversation.isPending}
                maxLength={200}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/200 characters
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createConversation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createConversation.isPending}
            >
              {createConversation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Section"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}