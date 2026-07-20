'use client';

import { useSession } from '@/lib/services/auth-client';
import { PasswordResetCard } from './password-reset-card';
import { EmailChangeCard } from './email-change-card';
import { ConnectedAccountsCard } from './connected-accounts-card';
import { ActiveSessionsCard } from './active-sessions-card';
import { AccountApiKeysCard } from './account-api-keys-card';
import { AccountDangerZone } from '@/components/dashboard/account-danger-zone';
import { getLinkedAccountsAction } from '@/modules/users/account-actions';
import { useEffect, useState } from 'react';

export function AccountTab({ currentEmail }: { currentEmail: string }) {
  const { data } = useSession();
  const currentToken = data?.session?.token ?? '';
  const [linked, setLinked] = useState<{ provider: string; linkedAt: Date }[]>([]);

  useEffect(() => {
    void getLinkedAccountsAction().then((result) => {
      if (!result.error && result.data) setLinked(result.data as { provider: string; linkedAt: Date }[]);
    });
  }, []);

  return (
    <div className="space-y-6">
      <PasswordResetCard />
      <EmailChangeCard currentEmail={currentEmail} />
      <ConnectedAccountsCard linked={linked} />
      <ActiveSessionsCard currentToken={currentToken} />
      <AccountApiKeysCard />
      <AccountDangerZone />
    </div>
  );
}
