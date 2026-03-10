"use client";

import { useEffect, useMemo, useState } from "react";
import type { ThreadMessage } from "@/modules/threads/queries";
import MessageItem from "./MessageItem";

export interface MessageNode extends ThreadMessage {
  children: MessageNode[];
}

const MAX_VISUAL_DEPTH = 3;

function buildTree(messages: ThreadMessage[]): MessageNode[] {
  const map = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];

  messages.forEach((msg) =>
    map.set(msg.id, {
      ...msg,
      children: [],
    }),
  );

  messages.forEach((msg) => {
    const node = map.get(msg.id)!;
    if (msg.parentId && map.has(msg.parentId)) {
      map.get(msg.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

interface MessageTreeProps {
  threadId: string;
  initialMessages: ThreadMessage[];
  currentUserId: string;
}

export default function MessageTree({
  threadId,
  initialMessages,
  currentUserId,
}: MessageTreeProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_WS_URL) {
      return;
    }

    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}/thread/${threadId}`,
    );

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data) as
        | { type: "NEW_MESSAGE"; message: ThreadMessage }
        | { type: "REACTION_UPDATE"; messageId: string; type: string; count: number }
        | { type: "AI_RESPONSE_READY"; message: ThreadMessage }
        | { type: "RESOLUTION_UPDATE"; score: number; breakdown: unknown }
        | { type: string; [key: string]: unknown };

      switch (payload.type) {
        case "NEW_MESSAGE":
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.message.id)) return prev;
            return [...prev, payload.message];
          });
          break;
        case "REACTION_UPDATE":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.messageId
                ? {
                    ...m,
                    reactions: (m.reactions || []).map((r) =>
                      r.type === payload.type
                        ? { ...r, _count: payload.count }
                        : r,
                    ),
                  }
                : m,
            ),
          );
          break;
        case "AI_RESPONSE_READY":
          setMessages((prev) => {
            const next = prev.filter(
              (m) => m.body !== payload.message.body || m.isAI,
            );
            if (next.some((m) => m.id === payload.message.id)) return next;
            return [...next, payload.message];
          });
          break;
        case "RESOLUTION_UPDATE":
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [threadId]);

  const tree = useMemo(() => buildTree(messages), [messages]);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="space-y-[12px]">
      {tree.map((node) => (
        <MessageBranch
          key={node.id}
          node={node}
          depth={0}
          currentUserId={currentUserId}
          rootAuthorId={node.author.id}
        />
      ))}
    </div>
  );
}

interface MessageBranchProps {
  node: MessageNode;
  depth: number;
  currentUserId: string;
  rootAuthorId: string;
}

function MessageBranch({
  node,
  depth,
  currentUserId,
  rootAuthorId,
}: MessageBranchProps) {
  const isBeyondMaxDepth = depth >= MAX_VISUAL_DEPTH;

  return (
    <div className={depth > 0 ? "ml-[44px]" : ""}>
      <MessageItem
        message={node}
        depth={depth}
        isOP={node.author.id === rootAuthorId}
        currentUserId={currentUserId}
        onReply={() => {}}
        onMarkAnswer={() => {}}
      />

      {!isBeyondMaxDepth && node.children.length > 0 && (
        <div className="mt-[8px] space-y-[8px]">
          {node.children.map((child) => (
            <MessageBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              currentUserId={currentUserId}
              rootAuthorId={rootAuthorId}
            />
          ))}
        </div>
      )}

      {isBeyondMaxDepth && node.children.length > 0 && (
        <button
          type="button"
          className="mt-[8px] text-[12px] font-medium text-(--blue)"
        >
          View more replies →
        </button>
      )}
    </div>
  );
}

