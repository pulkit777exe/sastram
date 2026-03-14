"use client";

import { useState, type MouseEvent } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import TimeAgo from "./TimeAgo";
import type {
  ThreadMessage,
  ThreadMessageReactionAggregate,
} from "@/modules/threads/queries";

interface MessageItemProps {
  message: ThreadMessage;
  depth: number;
  isOP: boolean;
  currentUserId: string;
  onReply: (messageId: string) => void;
  onMarkAnswer: (messageId: string) => void;
  onReact?: (
    messageId: string,
    type: ThreadMessageReactionAggregate["type"],
  ) => void;
}

export default function MessageItem({
  message,
  depth,
  isOP,
  currentUserId,
  onReply,
  onMarkAnswer,
  onReact,
}: MessageItemProps) {
  const upvoteReaction =
    message.reactions.find((r) => r.type === "UPVOTE") ?? null;

  const [upvotes, setUpvotes] = useState(upvoteReaction?._count ?? 0);
  const [optimisticDelta, setOptimisticDelta] = useState(0);
  const [isVoting, setIsVoting] = useState(false);

  const isAuthor = message.author.id === currentUserId;

  const avatarSize =
    depth === 0 ? 32 : depth === 1 ? 24 : depth >= 2 ? 20 : 32;

  const isAiMessage = message.isAI;

  const handleUpvote = async (event: MouseEvent) => {
    event.preventDefault();
    if (isVoting) return;

    const nextDelta = optimisticDelta === 1 ? 0 : 1;
    const previousTotal = upvotes + optimisticDelta;
    const nextTotal = previousTotal + (nextDelta - optimisticDelta);

    setOptimisticDelta(nextDelta);
    setIsVoting(true);

    try {
      await fetch("/api/reactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId: message.id,
          type: "UPVOTE",
        }),
      });

      setUpvotes(nextTotal);
      if (onReact) {
        onReact(message.id, "UPVOTE");
      }
    } catch {
      setOptimisticDelta(optimisticDelta);
    } finally {
      setIsVoting(false);
    }
  };

  const effectiveUpvotes = upvotes + optimisticDelta;

  const containerClasses =
    depth === 0
      ? "pt-[16px] pb-[20px]"
      : depth === 1
        ? "pt-[12px] pb-[16px] pl-[16px] border-l-[1.5px] border-border"
        : "pt-[10px] pb-[14px] pl-[16px] border-l border-dashed border-border";

  return (
    <article
      className={cn(
        "flex gap-[12px]",
        depth === 0 ? "border-b border-border last:border-b-0" : "",
      )}
    >
      <div className="flex flex-col items-center gap-[8px]">
        <div
          className={cn(
            "relative overflow-hidden rounded-full bg-(--blue-light)",
          )}
          style={{
            width: avatarSize,
            height: avatarSize,
          }}
        >
          {message.author.image ? (
            <Image
              src={message.author.image}
              alt={message.author.name ?? "Author avatar"}
              fill
              className="object-cover"
            />
          ) : null}
        </div>
        <div
          className={cn(
            "flex-1 w-px bg-border",
            isAiMessage && "bg-[rgba(55,54,252,0.15)]",
          )}
        />
      </div>

      <div className={cn("flex-1 min-w-0", containerClasses)}>
        <div className="flex flex-wrap items-center gap-[6px] text-[12px]">
          <span className="font-(--font-dm-sans) text-[13px] text-(--text)">
            {message.author.name ?? "Unknown"}
          </span>

          {isOP && (
            <span className="rounded-[999px] bg-(--blue-dim) px-[6px] py-[2px] font-(--font-dm-mono) text-[10px] uppercase tracking-[0.12em] text-(--blue)">
              OP
            </span>
          )}

          {isAiMessage && (
            <span className="rounded-[999px] bg-(--blue-dim) px-[6px] py-[2px] font-(--font-dm-mono) text-[10px] uppercase tracking-[0.12em] text-(--blue)">
              Synthesized
            </span>
          )}

          <TimeAgo date={message.createdAt} />
        </div>

        <div
          className={cn(
            "mt-[8px] rounded-[8px] bg-transparent text-[14px] leading-normal text-(--text)",
            isAiMessage &&
              "bg-(--blue-dim) border border-[rgba(55,54,252,0.1)]",
          )}
        >
          <p className="whitespace-pre-wrap wrap-break-word">{message.body}</p>
        </div>

        <div className="mt-[10px] flex flex-wrap items-center gap-[12px] text-[12px] text-muted">
          <button
            type="button"
            onClick={handleUpvote}
            disabled={isVoting}
            className={cn(
              "inline-flex items-center gap-[6px] rounded-[999px] border border-transparent px-[8px] py-[4px] font-medium transition-colors",
              effectiveUpvotes > 0
                ? "text-(--blue)"
                : "text-muted hover:text-(--blue)",
            )}
          >
            <span>▲</span>
            <span className="tabular-nums">
              {effectiveUpvotes > 0 ? effectiveUpvotes : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onReply(message.id)}
            className="inline-flex items-center gap-[6px] rounded-[999px] px-[8px] py-[4px] font-medium text-muted hover:text-(--blue)"
          >
            <span>Reply</span>
          </button>

          {isOP && (
            <button
              type="button"
              onClick={() => onMarkAnswer(message.id)}
              className="inline-flex items-center gap-[6px] rounded-[999px] px-[8px] py-[4px] font-medium text-muted hover:text-(--blue)"
            >
              <span>Mark Answer</span>
            </button>
          )}

          <button
            type="button"
            className="ml-auto inline-flex items-center gap-[4px] rounded-[999px] px-[6px] py-[4px] text-[12px] text-muted hover:text-(--text)"
          >
            <span>···</span>
          </button>
        </div>
      </div>
    </article>
  );
}

