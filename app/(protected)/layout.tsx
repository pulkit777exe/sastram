import { ReactNode } from "react";
import { requireSession } from "@/modules/auth/session";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <>{children}</>;
}

