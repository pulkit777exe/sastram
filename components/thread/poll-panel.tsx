"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PollDisplay } from "@/components/thread/poll-display";
import { createPollAction, closePollAction } from "@/modules/polls/actions";
import { toasts } from "@/lib/utils/toast";

type PollShape = {
  id: string;
  threadId: string;
  question: string;
  options: string[];
  isActive: boolean;
  expiresAt: Date | null;
};

interface PollPanelProps {
  threadId: string;
  initialPoll: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
  } | null;
  canManagePoll: boolean;
}

export function PollPanel({
  threadId,
  initialPoll,
  canManagePoll,
}: PollPanelProps) {
  const [poll, setPoll] = useState<PollShape | null>(
    initialPoll
      ? {
          ...initialPoll,
          threadId,
        }
      : null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [expiresAt, setExpiresAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const trimmedOptions = useMemo(
    () => options.map((option) => option.trim()).filter((option) => option.length > 0),
    [options],
  );

  if (!poll && !canManagePoll) {
    return null;
  }

  const createPoll = async () => {
    if (trimmedOptions.length < 2 || trimmedOptions.length > 6 || !question.trim()) {
      toasts.error("Please provide a question and 2 to 6 options.");
      return;
    }

    setIsSaving(true);
    const result = await createPollAction(
      threadId,
      question.trim(),
      trimmedOptions,
      expiresAt ? new Date(expiresAt) : undefined,
    );
    setIsSaving(false);

    if (result.error || !result.data) {
      toasts.serverError();
      return;
    }

    const resultOptions = Array.isArray(result.data.options)
      ? (result.data.options as string[])
      : [];

    setPoll({
      id: result.data.id,
      threadId,
      question: result.data.question,
      options: resultOptions,
      isActive: result.data.isActive,
      expiresAt: result.data.expiresAt,
    });
    setShowCreateForm(false);
    setQuestion("");
    setOptions(["", ""]);
    setExpiresAt("");
    toasts.saved();
  };

  const closePoll = async () => {
    if (!poll) return;
    setIsSaving(true);
    const result = await closePollAction(poll.id);
    setIsSaving(false);
    if (result.error) {
      toasts.serverError();
      return;
    }

    setPoll((prev) => (prev ? { ...prev, isActive: false } : prev));
    toasts.saved();
  };

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border/60 bg-card/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Poll
        </p>
        {!poll && canManagePoll && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? "Cancel" : "Add poll"}
          </Button>
        )}
      </div>

      {poll ? (
        <div className="space-y-3">
          <PollDisplay poll={poll} />
          {canManagePoll && poll.isActive && (
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={closePoll}
            >
              Close poll
            </Button>
          )}
        </div>
      ) : showCreateForm ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What should we prioritize?"
            />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            {options.map((option, index) => (
              <Input
                key={`poll-option-${index}`}
                value={option}
                onChange={(event) => {
                  setOptions((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  );
                }}
                placeholder={`Option ${index + 1}`}
              />
            ))}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={options.length >= 6}
                onClick={() => setOptions((prev) => [...prev, ""])}
              >
                Add option
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={options.length <= 2}
                onClick={() => setOptions((prev) => prev.slice(0, -1))}
              >
                Remove option
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="poll-expiry">Expiry (optional)</Label>
            <Input
              id="poll-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </div>

          <Button
            onClick={createPoll}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? "Saving..." : "Create poll"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No poll has been added to this thread yet.
        </p>
      )}
    </div>
  );
}
