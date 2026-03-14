import { SettingsForm } from "@/components/dashboard/settings-form";
import { NewsletterManagement } from "@/components/dashboard/newsletter-management";
import { getUserNewsletterSubscriptions } from "@/modules/newsletter/actions";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { prisma } from "@/lib/infrastructure/prisma";
import { getSession } from "@/modules/auth";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex h-1/2 items-center justify-center">
        Please log in to view settings.
      </div>
    );
  }

  const tab = (await searchParams).tab || "profile";
  const subscriptionsResult = await getUserNewsletterSubscriptions();
  const subscriptions = subscriptionsResult.data ?? [];

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
      image: true,
      avatarUrl: true,
      bannerUrl: true,
    },
  });

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2">
          Manage your account settings, notifications, and appearance
          preferences.
        </p>
      </div>

      <SettingsTabs activeTab={tab} />
      {tab === "profile" && user && <SettingsForm user={user} />}
      {tab === "newsletters" && (
        <NewsletterManagement subscriptions={subscriptions} />
      )}
    </div>
  );
}
