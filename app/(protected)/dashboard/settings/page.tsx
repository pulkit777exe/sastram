import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { NewsletterManagement } from "@/components/dashboard/newsletter-management";
import { getUserNewsletterSubscriptions } from "@/modules/newsletter/actions";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { prisma } from "@/lib/infrastructure/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-zinc-500">
        Please log in to view settings.
      </div>
    );
  }

  const tab = (await searchParams).tab || "profile";
  const subscriptions = await getUserNewsletterSubscriptions();
  
  // Fetch full user data including bio, location, etc.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      location: true,
      website: true,
      twitter: true,
      github: true,
      linkedin: true,
      image: true,
      avatarUrl: true,
      bannerUrl: true,
    },
  });

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h1 className="text-4xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-zinc-500 mt-2">
          Manage your account settings, notifications, and appearance preferences.
        </p>
      </div>

      <SettingsTabs activeTab={tab} />

      {tab === "profile" && user && <SettingsForm user={user} />}
      {tab === "newsletters" && <NewsletterManagement subscriptions={subscriptions} />}
    </div>
  );
}