import { redirect } from "next/navigation";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    redirect("/dashboard");
  }

  redirect("/login");
}