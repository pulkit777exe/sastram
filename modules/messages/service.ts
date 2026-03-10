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

  // First pass: create all nodes
  for (const msg of flatMessages) {
    const node: MessageNode = {
      ...msg,
      children: [],
      isCollapsed: false,
      likeCount: (msg as MessageNode).likeCount ?? 0,
      replyCount: (msg as MessageNode).replyCount ?? 0,
      isAiResponse: (msg as MessageNode).isAiResponse ?? false,
    };
    nodeMap.set(msg.id, node);
  }

  // Second pass: link children to parents
  for (const msg of flatMessages) {
    const node = nodeMap.get(msg.id)!;
    if (msg.parentId && nodeMap.has(msg.parentId)) {
      const parent = nodeMap.get(msg.parentId)!;
      parent.children.push(node);
    } else {
      // Root message (no parent, or parent not in this set)
      roots.push(node);
    }
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
export function getCollapseKey(sectionId: string, messageId: string): string {
  return `thread-collapse:${sectionId}:${messageId}`;
}

/**
 * Load collapse states from localStorage for a given thread.
 */
export function loadCollapseStates(sectionId: string): Map<string, boolean> {
  const states = new Map<string, boolean>();
  if (typeof window === "undefined") return states;

  const prefix = `thread-collapse:${sectionId}:`;
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
  sectionId: string,
  messageId: string,
  collapsed: boolean,
): void {
  if (typeof window === "undefined") return;
  const key = getCollapseKey(sectionId, messageId);
  if (collapsed) {
    localStorage.setItem(key, "true");
  } else {
    localStorage.removeItem(key);
  }
}
