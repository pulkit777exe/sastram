import { requireSession } from "@/modules/auth/session";
import type { Role } from "@prisma/client";

export async function requireModerator() {
  const session = await requireSession();
  const role = session.user.role as Role;

  if (role !== "MODERATOR" && role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  const role = session.user.role as Role;

  if (role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  return session;
}

