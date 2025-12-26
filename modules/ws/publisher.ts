import { publishThreadEvent } from "@/lib/infrastructure/websocket/server";
import type { MentionData } from "@/lib/types/index";

export function emitThreadMessage(threadId: string, payload: unknown) {
  publishThreadEvent(threadId, {
    type: "NEW_MESSAGE",
    payload,
  });
}

export function emitTypingIndicator(
  threadId: string,
  user: { id: string; name: string },
  isTyping: boolean
) {
  publishThreadEvent(threadId, {
    type: isTyping ? "USER_TYPING" : "USER_STOPPED_TYPING",
    payload: {
      userId: user.id,
      userName: user.name,
      sectionId: threadId,
    },
  });
}

export function emitMessageDeleted(threadId: string, messageId: string) {
  publishThreadEvent(threadId, {
    type: "MESSAGE_DELETED",
    payload: {
      messageId,
      sectionId: threadId,
    },
  });
}

export function emitMentionNotification(
  threadId: string,
  mention: MentionData
) {
  publishThreadEvent(threadId, {
    type: "MENTION_NOTIFICATION",
    payload: mention,
  });
}
