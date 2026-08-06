import { SettingsForm } from '@/components/dashboard/settings-form';
import { NewsletterManagement } from '@/components/dashboard/newsletter-management';
import { PreferencesForm } from '@/components/dashboard/preferences-form';
import { AccountTab } from '@/components/dashboard/account/account-tab';
import { getUserNewsletterSubscriptions } from '@/modules/newsletter/actions';
import { SettingsTabs } from '@/components/dashboard/settings-tabs';
import { prisma } from '@/lib/infrastructure/prisma';
import { getSession } from '@/modules/auth';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex h-1/2 items-center justify-center">Please log in to view settings.</div>
    );
  }

  const tab = (await searchParams).tab || 'profile';
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
      preferences: true,
      profilePrivacy: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Personal workspace</p>
        <h1 className="text-3xl font-medium tracking-[-0.03em]">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, preferences, and account access.
        </p>
      </div>

      <SettingsTabs activeTab={tab} />
      {tab === 'profile' && user && <SettingsForm user={user} />}
      {tab === 'newsletters' && <NewsletterManagement subscriptions={subscriptions} />}
      {tab === 'preferences' && user && <PreferencesForm user={user} />}
      {tab === 'account' && user && <AccountTab currentEmail={user.email} />}
    </div>
  );
}
