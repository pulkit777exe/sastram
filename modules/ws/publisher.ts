import { publishThreadEvent } from "@/lib/ws/server";

export function emitThreadMessage(threadId: string, payload: unknown) {
  publishThreadEvent(threadId, {
    type: "THREAD_MESSAGE",
    payload,
  });
}

