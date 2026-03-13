import type { Message } from "@/lib/types/index";
import type { MessageNode } from "./types";

const MAX_DEPTH = 4;

/**
 * Builds a nested message tree from a flat array of messages.
 * Single-pass algorithm using a Map for O(n) performance.
 *
 * @param flatMessages - Flat array of messages from DB (ordered by createdAt)
 * @returns Array of root-level MessageNodes with nested children
 */
export function buildMessageTree(flatMessages: Message[]): MessageNode[] {
  const nodeMap = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];
  const pendingChildren = new Map<string, MessageNode[]>();

  // Single pass: create nodes and attach to parents (or queue until parent arrives)
  for (const msg of flatMessages) {
    let node = nodeMap.get(msg.id);
    if (node) {
      Object.assign(node, msg, {
        isCollapsed: node.isCollapsed ?? false,
        likeCount: (msg as MessageNode).likeCount ?? node.likeCount ?? 0,
        replyCount: (msg as MessageNode).replyCount ?? node.replyCount ?? 0,
        isAiResponse:
          (msg as MessageNode).isAiResponse ?? node.isAiResponse ?? false,
        children: node.children ?? [],
      });
    } else {
      node = {
        ...msg,
        children: [],
        isCollapsed: false,
        likeCount: (msg as MessageNode).likeCount ?? 0,
        replyCount: (msg as MessageNode).replyCount ?? 0,
        isAiResponse: (msg as MessageNode).isAiResponse ?? false,
      };
      nodeMap.set(msg.id, node);
    }

    const queued = pendingChildren.get(msg.id);
    if (queued && queued.length > 0) {
      node.children.push(...queued);
      pendingChildren.delete(msg.id);
    }

    if (msg.parentId) {
      const parent = nodeMap.get(msg.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        const list = pendingChildren.get(msg.parentId);
        if (list) {
          list.push(node);
        } else {
          pendingChildren.set(msg.parentId, [node]);
        }
      }
    } else {
      roots.push(node);
    }
  }

  // Attach any children whose parents were missing from this list.
  for (const orphaned of pendingChildren.values()) {
    roots.push(...orphaned);
  }

  // Sort children by createdAt within each parent
  for (const node of nodeMap.values()) {
    node.children.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  // Sort roots by createdAt
  roots.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return roots;
}

/**
 * Count total descendants of a node (recursive).
 */
export function countDescendants(node: MessageNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

/**
 * Check if a message is beyond the visual depth limit.
 */
export function isBeyondDepthLimit(depth: number): boolean {
  return depth >= MAX_DEPTH;
}

/**
 * Get the collapse state key for localStorage persistence.
 */
export function getCollapseKey(threadId: string, messageId: string): string {
  return `thread-collapse:${threadId}:${messageId}`;
}

/**
 * Load collapse states from localStorage for a given thread.
 */
export function loadCollapseStates(threadId: string): Map<string, boolean> {
  const states = new Map<string, boolean>();
  if (typeof window === "undefined") return states;

  const prefix = `thread-collapse:${threadId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const messageId = key.slice(prefix.length);
      states.set(messageId, localStorage.getItem(key) === "true");
    }
  }
  return states;
}

/**
 * Save a collapse state to localStorage.
 */
export function saveCollapseState(
  threadId: string,
  messageId: string,
  collapsed: boolean,
): void {
  if (typeof window === "undefined") return;
  const key = getCollapseKey(threadId, messageId);
  if (collapsed) {
    localStorage.setItem(key, "true");
  } else {
    localStorage.removeItem(key);
  }
}
