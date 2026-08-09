import type { Message } from '@/lib/types/index';
import type { MessageNode } from './types';

const MAX_DEPTH = 4;
const COLLAPSE_KEY_PREFIX = 'thread-collapse:';

function toNode(msg: Message): MessageNode {
  return {
    id: msg.id,
    content: msg.content,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    senderId: msg.senderId,
    threadId: msg.threadId,
    parentId: msg.parentId ?? null,
    depth: msg.depth ?? 0,
    isEdited: msg.isEdited ?? false,
    isPinned: msg.isPinned ?? false,
    likeCount: msg.likeCount ?? 0,
    replyCount: msg.replyCount ?? 0,
    isAiResponse: msg.isAiResponse ?? false,
    deletedAt: msg.deletedAt ?? null,
    sender: msg.sender ?? { id: msg.senderId ?? '', name: null, image: null },
    thread: msg.thread ?? { id: msg.threadId, name: '', slug: '' },
    attachments: msg.attachments ?? [],
    children: [],
    isCollapsed: false,
  };
}

const byCreatedAt = (a: MessageNode, b: MessageNode) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

export function buildMessageTree(flatMessages: Message[]): MessageNode[] {
  const nodeMap = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];
  // Replies can appear before their parent (pagination, realtime inserts), so
  // park them here until the parent shows up.
  const pendingChildren = new Map<string, MessageNode[]>();

  for (const msg of flatMessages) {
    const existing = nodeMap.get(msg.id);
    let node: MessageNode;

    if (existing) {
      node = Object.assign(existing, msg, {
        isCollapsed: existing.isCollapsed ?? false,
        likeCount: msg.likeCount ?? existing.likeCount ?? 0,
        replyCount: msg.replyCount ?? existing.replyCount ?? 0,
        isAiResponse: msg.isAiResponse ?? existing.isAiResponse ?? false,
        children: existing.children ?? [],
      });
    } else {
      node = toNode(msg);
      nodeMap.set(msg.id, node);
    }

    const queued = pendingChildren.get(msg.id);
    if (queued?.length) {
      node.children.push(...queued);
      pendingChildren.delete(msg.id);
    }

    if (!msg.parentId) {
      roots.push(node);
      continue;
    }

    const parent = nodeMap.get(msg.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      const waiting = pendingChildren.get(msg.parentId);
      if (waiting) waiting.push(node);
      else pendingChildren.set(msg.parentId, [node]);
    }
  }

  // Parents that never arrived — surface their replies rather than dropping them.
  for (const orphaned of pendingChildren.values()) {
    roots.push(...orphaned);
  }

  for (const node of nodeMap.values()) {
    node.children.sort(byCreatedAt);
  }
  roots.sort(byCreatedAt);

  return roots;
}

export function countDescendants(node: MessageNode): number {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
}

export function isBeyondDepthLimit(depth: number): boolean {
  return depth >= MAX_DEPTH;
}

export function getCollapseKey(threadId: string, messageId: string): string {
  return `${COLLAPSE_KEY_PREFIX}${threadId}:${messageId}`;
}

export function loadCollapseStates(threadId: string): Map<string, boolean> {
  const states = new Map<string, boolean>();
  if (typeof window === 'undefined') return states;

  const prefix = `${COLLAPSE_KEY_PREFIX}${threadId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      states.set(key.slice(prefix.length), localStorage.getItem(key) === 'true');
    }
  }
  return states;
}

export function saveCollapseState(threadId: string, messageId: string, collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  const key = getCollapseKey(threadId, messageId);
  // Absence means "expanded", so clear the entry instead of storing 'false'.
  if (collapsed) {
    localStorage.setItem(key, 'true');
  } else {
    localStorage.removeItem(key);
  }
}
