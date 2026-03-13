import { redirect } from "next/navigation";
import { useSession } from "@/lib/session-context";

export default async function Home() {
  const session = useSession();
  if (session) {
    redirect("/dashboard");
  }

  redirect("/login");
}
