'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { User, Mail, Settings, Shield } from 'lucide-react';
import { SegmentedControl } from '@/components/interior/segmented-control';

export function SettingsTabs({ activeTab }: { activeTab: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs = [
    { value: 'profile', label: 'Profile' },
    { value: 'newsletters', label: 'Newsletters' },
    { value: 'preferences', label: 'Preferences' },
    { value: 'account', label: 'Account' },
  ];

  function handleTabChange(tabId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.push(`/dashboard/settings?${params.toString()}`);
  }

  return (
    <SegmentedControl
      options={tabs}
      label="Settings tabs"
      value={activeTab}
      onValueChange={handleTabChange}
    />
  );
}
