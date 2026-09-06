'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { changeEmailAction } from '@/modules/users/account-actions';

export function EmailChangeCard({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;
    setSaving(true);
    try {
      const result = await changeEmailAction({ newEmail });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Verification email sent to your new address');
      setNewEmail('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email address</CardTitle>
        <CardDescription>
          Current email: <span className="font-medium">{currentEmail}</span>. Changing your email
          requires verification from the new address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <Button type="submit" disabled={saving || !newEmail}>
            {saving ? 'Sending verification…' : 'Send verification email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
