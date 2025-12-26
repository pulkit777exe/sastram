import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Role, User } from "@prisma/client";
import { auth } from "@/lib/services/auth";
import { prisma } from "@/lib/infrastructure/prisma";

export type SessionUser = Pick<User, "id" | "email" | "name" | "image" | "role">;

export interface SessionPayload {
  user: SessionUser;
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const { user } = session;
  // Fetch the full user from database to get the role field
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, image: true, role: true },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role: (fullUser?.role as Role) ?? Role.USER,
    },
  };
});

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export function isAdmin(user: SessionUser | undefined | null): boolean {
  return user?.role === Role.ADMIN;
}

export function assertAdmin(user: SessionUser | undefined | null) {
  if (!isAdmin(user)) {
    redirect("/dashboard");
  }
}

