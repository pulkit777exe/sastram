import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "@/components/dashboard/profile-view";

export default async function ProfilePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return <div>Please log in to view your profile.</div>;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      _count: {
        select: {
          messages: true,
          sections: true,
        },
      },
    },
  });

  if (!user) return <div>User not found</div>;

  return (
    <div className="space-y-8">
      <ProfileView user={user} />
    </div>
  );
}
