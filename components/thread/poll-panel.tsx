"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PollDisplay } from "@/components/thread/poll-display";
import { createPollAction, closePollAction } from "@/modules/polls/actions";
import { toasts } from "@/lib/utils/toast";
import { ChevronDown, BarChart3, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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
  initialPoll: Omit<PollShape, "threadId"> | null;
  canManagePoll: boolean;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const EMPTY_OPTIONS: string[] = ["", ""];

export function PollPanel({
  threadId,
  initialPoll,
  canManagePoll,
}: PollPanelProps) {
  const [poll, setPoll] = useState<PollShape | null>(
    initialPoll ? { ...initialPoll, threadId } : null,
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [expiresAt, setExpiresAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const trimmedOptions = useMemo(
    () =>
      options
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    [options],
  );

  const isFormValid =
    question.trim().length > 0 &&
    trimmedOptions.length >= MIN_OPTIONS &&
    trimmedOptions.length <= MAX_OPTIONS;

  if (!poll && !canManagePoll) return null;

  function handleAddOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function handleRemoveOption() {
    setOptions((prev) => prev.slice(0, -1));
  }

  function handleOptionChange(index: number, value: string) {
    setOptions((prev) =>
      prev.map((item, i) => (i === index ? value : item)),
    );
  }

  function handleCancelCreate() {
    setShowCreateForm(false);
    setQuestion("");
    setOptions(EMPTY_OPTIONS);
    setExpiresAt("");
  }

  async function handleCreatePoll() {
    if (!isFormValid) {
      toasts.error(
        "Invalid poll.",
        `Please add a question and between ${MIN_OPTIONS}–${MAX_OPTIONS} options.`,
      );
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

    handleCancelCreate();
    toasts.saved();
  }

  async function handleClosePoll() {
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
  }


  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card/70 overflow-hidden">
      {/* ── Header / Collapse trigger ── */}
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 text-left",
          "transition-colors hover:bg-muted/40 focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        )}
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2">
          {/* Colored dot — green=active, gray=closed/none */}
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              poll?.isActive
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                : "bg-muted-foreground/40",
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {poll ? "Poll" : "Add poll"}
          </span>
          {poll && (
            <span className="hidden sm:inline text-xs text-muted-foreground/60 font-normal truncate max-w-[200px]">
              · {poll.question}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Vote count badge */}
          {poll && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
              <BarChart3 size={10} />
              {poll.isActive ? "Active" : "Closed"}
            </span>
          )}

          <motion.div
            animate={{ rotate: isCollapsed ? -90 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <ChevronDown
              size={15}
              className="text-muted-foreground/60"
            />
          </motion.div>
        </div>
      </button>

      {/* ── Collapsible body ── */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="poll-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
              {poll ? (
                // ── Existing poll ──
                <div className="space-y-3">
                  <PollDisplay poll={poll} />
                  {canManagePoll && poll.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      onClick={handleClosePoll}
                      className="text-xs"
                    >
                      {isSaving ? "Closing..." : "Close poll"}
                    </Button>
                  )}
                </div>
              ) : showCreateForm ? (
                // ── Create form ──
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="poll-question" className="text-xs">
                      Question
                    </Label>
                    <Input
                      id="poll-question"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What should we prioritize?"
                      className="text-sm"
                      maxLength={500}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">
                      Options
                      <span className="ml-1 text-muted-foreground font-normal">
                        ({trimmedOptions.length}/{MAX_OPTIONS})
                      </span>
                    </Label>

                    <AnimatePresence>
                      {options.map((option, index) => (
                        <motion.div
                          key={`poll-option-${index}`}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Input
                            value={option}
                            onChange={(e) =>
                              handleOptionChange(index, e.target.value)
                            }
                            placeholder={`Option ${index + 1}`}
                            className="text-sm"
                            maxLength={200}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={options.length >= MAX_OPTIONS}
                        onClick={handleAddOption}
                        className="h-7 text-xs gap-1"
                      >
                        <Plus size={11} />
                        Add option
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={options.length <= MIN_OPTIONS}
                        onClick={handleRemoveOption}
                        className="h-7 text-xs text-muted-foreground"
                      >
                        Remove last
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="poll-expiry" className="text-xs">
                      Expiry{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id="poll-expiry"
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="text-sm"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      onClick={handleCreatePoll}
                      disabled={isSaving || !isFormValid}
                      size="sm"
                      className="flex-1"
                    >
                      {isSaving ? "Creating..." : "Create poll"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelCreate}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // ── Empty state ──
                <div className="flex flex-col items-center py-4 gap-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    No poll has been added to this thread yet.
                  </p>
                  {canManagePoll && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateForm(true)}
                      className="gap-1.5 text-xs"
                    >
                      <Plus size={12} />
                      Add poll
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}