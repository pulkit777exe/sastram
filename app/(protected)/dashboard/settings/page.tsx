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
  let subscriptions: Awaited<ReturnType<typeof getUserNewsletterSubscriptions>>['data'] = [];
  try {
    const subscriptionsResult = await getUserNewsletterSubscriptions();
    subscriptions = subscriptionsResult.data ?? [];
  } catch {
    subscriptions = [];
  }

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
  }).catch(() => null);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif-heading text-2xl text-ink">Settings</h1>
        <p className="text-sm text-ink-3 mt-1">Manage your account, notifications, and appearance.</p>
      </div>

      <div className="rounded-card border border-line bg-surface shadow-card p-2">
        <SettingsTabs activeTab={tab} />
      </div>
      {tab === 'profile' && user && <SettingsForm user={user} />}
      {tab === 'newsletters' && <NewsletterManagement subscriptions={subscriptions} />}
      {tab === 'preferences' && user && <PreferencesForm user={user} />}
      {tab === 'account' && user && <AccountTab currentEmail={user.email} />}
    </div>
  );
}
