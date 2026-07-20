'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { signIn } from '@/lib/services/auth-client';
import { GithubIcon } from '@/public/icons/github';
import { ChromeIcon } from '@/public/icons/google';
import { unlinkAccountAction } from '@/modules/users/account-actions';

interface LinkedAccount {
  provider: string;
  linkedAt: Date;
}

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: ChromeIcon },
  { id: 'github', label: 'GitHub', icon: GithubIcon },
] as const;

export function ConnectedAccountsCard({ linked }: { linked: LinkedAccount[] }) {
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const linkedSet = new Set(linked.map((l) => l.provider));

  function handleLink(provider: string) {
    void signIn.social({
      provider: provider as 'google' | 'github',
      callbackURL: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/settings?tab=account`,
    });
  }

  async function handleUnlink(provider: string) {
    setUnlinking(provider);
    try {
      const result = await unlinkAccountAction({ provider });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Unlinked ${provider}`);
    } finally {
      setUnlinking(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Link social accounts to sign in without a password. You must keep at least one sign-in
          method.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROVIDERS.map((provider) => {
          const Icon = provider.icon;
          const isLinked = linkedSet.has(provider.id);
          return (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">{provider.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {isLinked ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              {isLinked ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unlinking === provider.id || linkedSet.size <= 1}
                  onClick={() => handleUnlink(provider.id)}
                >
                  {unlinking === provider.id ? 'Unlinking…' : 'Unlink'}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => handleLink(provider.id)}>
                  Link
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
