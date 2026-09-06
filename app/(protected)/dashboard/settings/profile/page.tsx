import Image from 'next/image';
import Link from 'next/link';
import { isAdminUser as isAdmin } from '@/modules/auth';
import { getSession } from '@/modules/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Settings } from 'lucide-react';

function getUserInitial(name: string | null | undefined, email: string): string {
  const source = name || email;
  const firstChar = source[0];
  if (!firstChar) return '?';
  return firstChar.toUpperCase();
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) return null;
  const user = session.user;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/dashboard/settings">
          <Button type="button" variant="ghost" size="sm">
            <ArrowLeft size={16} className="mr-2" />
            Back to Settings
          </Button>
        </Link>
      </div>

      <Card className="rounded-card border p-4 md:p-8 shadow-linear-sm">
        <CardContent className="flex flex-col gap-6 p-0 md:flex-row md:items-center">
          <div className="flex h-20 w-20 items-center justify-center bg-secondary overflow-hidden rounded-full">
            {user.image ? (
              <Image src={user.image} alt={user.name ?? 'Avatar'} width={80} height={80} />
            ) : (
              <span className="text-2xl font-semibold">
                {getUserInitial(user.name, user.email)}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm uppercase tracking-widest">Profile</p>
            <h1 className="mt-2 text-2xl font-semibold">{user.name || 'Unnamed'}</h1>
            <p className="text-muted-foreground">{user.email}</p>
            <Badge variant="live" className="mt-2 uppercase tracking-wide">
              {user.role}
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/dashboard/settings">
              <Button type="button" variant="outline" size="sm">
                <Settings size={14} className="mr-2" />
                Edit Settings
              </Button>
            </Link>
            {isAdmin(user) && (
              <Link href="/dashboard/admin">
                <Button type="button" variant="outline" size="sm">
                  Admin Tools
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-card border p-6 shadow-linear-sm">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-lg font-semibold">Account Information</h2>
          <p className="text-sm text-muted-foreground">
            Manage your profile settings, newsletter subscriptions, and preferences from the
            Settings page.
          </p>
          <div className="rounded-card border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Link
              href="/dashboard/settings"
              className="text-brand hover:text-brand/80 underline"
            >
              Go to Settings
            </Link>{' '}
            to update your profile, manage newsletters, and configure notifications.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
