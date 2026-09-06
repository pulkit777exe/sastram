import type { Message } from '@/lib/types/index';
import type { MessageNode } from './types';

const MAX_DEPTH = 4;
const COLLAPSE_KEY_PREFIX = 'thread-collapse:';

function resolveSender(msg: Message): NonNullable<Message['sender']> {
  if (msg.sender) return msg.sender;
  return { id: msg.senderId ?? '', name: null, image: null };
}

function resolveThread(msg: Message): NonNullable<Message['thread']> {
  if (msg.thread) return msg.thread;
  return { id: msg.threadId, name: '', slug: '' };
}

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
    sender: resolveSender(msg),
    thread: resolveThread(msg),
    attachments: msg.attachments ?? [],
    children: [],
    isCollapsed: false,
  };
}

function compareByCreatedAt(a: MessageNode, b: MessageNode): number {
  const timeA = new Date(a.createdAt).getTime();
  const timeB = new Date(b.createdAt).getTime();
  return timeA - timeB;
}

function rehydrateExistingNode(existing: MessageNode, msg: Message): MessageNode {
  existing.content = msg.content;
  existing.createdAt = msg.createdAt;
  existing.updatedAt = msg.updatedAt;
  existing.senderId = msg.senderId;
  existing.threadId = msg.threadId;
  existing.parentId = msg.parentId ?? null;
  existing.depth = msg.depth ?? existing.depth ?? 0;
  if (msg.likeCount !== undefined && msg.likeCount !== null) existing.likeCount = msg.likeCount;
  if (msg.replyCount !== undefined && msg.replyCount !== null) existing.replyCount = msg.replyCount;
  if (msg.isAiResponse !== undefined && msg.isAiResponse !== null) existing.isAiResponse = msg.isAiResponse;
  existing.children ??= [];
  existing.isCollapsed ??= false;
  existing.sender = msg.sender ?? existing.sender;
  existing.thread = msg.thread ?? existing.thread;
  existing.attachments = msg.attachments ?? existing.attachments;
  existing.isEdited = msg.isEdited ?? existing.isEdited;
  existing.isPinned = msg.isPinned ?? existing.isPinned;
  existing.deletedAt = msg.deletedAt ?? existing.deletedAt;
  return existing;
}

function attachQueuedChildren(node: MessageNode, pendingChildren: Map<string, MessageNode[]>) {
  const queued = pendingChildren.get(node.id);
  if (!queued?.length) return;
  node.children.push(...queued);
  pendingChildren.delete(node.id);
}

function attachToParentOrQueue(
  node: MessageNode,
  parentId: string | null | undefined,
  nodeMap: Map<string, MessageNode>,
  pendingChildren: Map<string, MessageNode[]>,
  roots: MessageNode[]
) {
  if (!parentId) {
    roots.push(node);
    return;
  }
  const parent = nodeMap.get(parentId);
  if (parent) parent.children.push(node);
  else {
    const waiting = pendingChildren.get(parentId);
    if (waiting) waiting.push(node);
    else pendingChildren.set(parentId, [node]);
  }
}

export function buildMessageTree(flatMessages: Message[]): MessageNode[] {
  const nodeMap = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];
  const pendingChildren = new Map<string, MessageNode[]>();

  for (const msg of flatMessages) {
    const existing = nodeMap.get(msg.id);
    const node = existing ? rehydrateExistingNode(existing, msg) : toNode(msg);
    if (!existing) nodeMap.set(msg.id, node);

    attachQueuedChildren(node, pendingChildren);
    attachToParentOrQueue(node, msg.parentId, nodeMap, pendingChildren, roots);
  }

  for (const orphaned of pendingChildren.values()) roots.push(...orphaned);

  for (const node of nodeMap.values()) node.children.sort(compareByCreatedAt);
  roots.sort(compareByCreatedAt);
  return roots;
}

export function countDescendants(node: MessageNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1;
    count += countDescendants(child);
  }
  return count;
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
