"use client";

import { useEffect, useMemo, useState } from "react";
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
import { getPopularTagsAction } from "@/modules/tags/actions";
import { toasts } from "@/lib/utils/toast";
import { useRouter } from "next/navigation";

export function CreateTopicButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    void getPopularTagsAction(30).then((result) => {
      const tags = Array.isArray(result.data)
        ? result.data.map((tag) => tag.name.toLowerCase())
        : [];
      setPopularTags(tags);
    });
  }, [open]);

  const tagSuggestions = useMemo(() => {
    const normalized = tagInput.trim().toLowerCase();
    if (!normalized) return [];
    return popularTags
      .filter((tag) => tag.includes(normalized))
      .filter((tag) => !selectedTags.includes(tag))
      .slice(0, 5);
  }, [popularTags, selectedTags, tagInput]);

  function addTag(rawTag: string) {
    const tag = rawTag.trim().toLowerCase();
    if (!tag) return;
    if (selectedTags.includes(tag)) {
      setTagInput("");
      return;
    }
    if (selectedTags.length >= 5) {
      toasts.error("You can add up to 5 tags.");
      return;
    }
    setSelectedTags((prev) => [...prev, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setSelectedTags((prev) => prev.filter((item) => item !== tag));
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.set("tags", JSON.stringify(selectedTags));
    const result = await createTopic(formData);
    setLoading(false);

    if (result?.error) {
      toasts.error(result.error);
    } else {
      toasts.saved();
      setOpen(false);
      setSelectedTags([]);
      setTagInput("");
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-500 hover:bg-indigo-400 cursor-pointer">New Thread</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
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
            <Label htmlFor="title" className="text-zinc-500">
              Title
            </Label>
            <Input id="title" name="title" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-500">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              className="min-h-[100px]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags" className="text-zinc-500">
              Tags (up to 5)
            </Label>
            <Input
              id="tags"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="Type a tag and press Enter"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag(tagInput);
                }
              }}
            />

            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                >
                  #{tag} ×
                </button>
              ))}
            </div>
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
