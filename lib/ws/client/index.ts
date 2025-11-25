export function getThreadSocketUrl(threadId: string) {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws/thread/${threadId}`;
}

export function createThreadSocket(threadId: string) {
  if (typeof window === "undefined") return null;
  const url = getThreadSocketUrl(threadId);
  return new WebSocket(url);
}

