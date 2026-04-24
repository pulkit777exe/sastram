'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreadMessage, ThreadMessageReactionAggregate } from '@/modules/threads/queries';
import MessageItem from './MessageItem';
import { useBootstrap } from '@/components/bootstrap-provider';

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
    })
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

function updateReactionCounts(
  reactions: ThreadMessageReactionAggregate[],
  reactionType: string,
  count: number
) {
  const next = reactions.map((reaction) =>
    reaction.type === reactionType ? { ...reaction, _count: count } : reaction
  );

  if (!next.some((reaction) => reaction.type === reactionType) && count > 0) {
    next.push({ type: reactionType, _count: count });
  }

  return next.filter((reaction) => reaction._count > 0);
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
  const { incrementNotificationCount } = useBootstrap();
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_WS_URL) {
      return;
    }

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/thread/${threadId}`);

    ws.onmessage = (event) => {
      if (!mounted.current) return;
      const message = JSON.parse(event.data) as {
        type: string;
        payload?: Record<string, unknown>;
      };

      switch (message.type) {
        case 'NEW_MESSAGE': {
          const payload = message.payload as {
            id: string;
            content: string;
            senderId: string;
            senderName?: string | null;
            senderAvatar?: string | null;
            createdAt: string | Date;
            sectionId: string;
            parentId?: string | null;
            depth?: number;
            likeCount?: number;
            replyCount?: number;
            isAiResponse?: boolean;
            reactions?: ThreadMessageReactionAggregate[];
            attachments?: Array<{
              id: string;
              url: string;
              type: string;
              name: string | null;
              size: number | null;
            }>;
          };
          const newMessage: ThreadMessage = {
            id: payload.id,
            body: payload.content,
            sectionId: payload.sectionId,
            senderId: payload.senderId,
            parentId: payload.parentId ?? null,
            depth: payload.depth ?? 0,
            createdAt: new Date(payload.createdAt),
            isEdited: false,
            isPinned: false,
            isAI: payload.isAiResponse ?? false,
            deletedAt: null,
            likeCount: payload.likeCount ?? 0,
            replyCount: payload.replyCount ?? 0,
            author: {
              id: payload.senderId,
              name: payload.senderName ?? null,
              image: payload.senderAvatar ?? null,
            },
            reactions: payload.reactions ?? [],
            _count: { replies: payload.replyCount ?? 0 },
            attachments: payload.attachments ?? [],
          };
          setMessages((prev) => {
const existingIndex = prev.findIndex((m) => m.id === newMessage.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], body: newMessage.body };
            return updated;
          }
          return [...prev, newMessage];
          });
          break;
        }
        case 'REACTION_UPDATE': {
          const payload = message.payload as {
            messageId: string;
            reactionType: string;
            count: number;
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.messageId
                ? {
                    ...m,
                    reactions: updateReactionCounts(
                      m.reactions || [],
                      payload.reactionType,
                      payload.count
                    ),
                  }
                : m
            )
          );
          break;
        }
        case 'AI_RESPONSE_READY': {
          const payload = message.payload as { message: ThreadMessage };
          setMessages((prev) => {
            const next = prev.filter((m) => m.body !== payload.message.body || m.isAI);
            if (next.some((m) => m.id === payload.message.id)) return next;
            return [...next, payload.message];
          });
          break;
        }
        case 'MENTION_NOTIFICATION': {
          const payload = message.payload as {
            mentionedUserId?: string;
          };
          if (payload?.mentionedUserId === currentUserId) {
            incrementNotificationCount(1);
          }
          break;
        }
        case 'RESOLUTION_UPDATE':
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [threadId, currentUserId, incrementNotificationCount]);

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

function MessageBranch({ node, depth, currentUserId, rootAuthorId }: MessageBranchProps) {
  const isBeyondMaxDepth = depth >= MAX_VISUAL_DEPTH;

  return (
    <div className={depth > 0 ? 'ml-[44px]' : ''}>
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
        <button type="button" className="mt-[8px] text-[12px] font-medium text-(--blue)">
          View more replies →
        </button>
      )}
    </div>
  );
}
