import { redirect } from "next/navigation";
import { requireSession } from "@/modules/auth/session";

export default async function ChatPage() {
  await requireSession();
  redirect("/dashboard/threads");
}