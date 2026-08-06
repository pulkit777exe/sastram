import Image from 'next/image';
import Link from 'next/link';
import { isAdmin } from '@/modules/auth/session';
import { getSession } from '@/modules/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings } from 'lucide-react';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) return null;
  const user = session.user;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/settings">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft size={16} className="mr-2" />
            Back to Settings
          </Button>
        </Link>
      </div>

      <Card className="linear-surface rounded-xl border p-5 md:p-7">
        <CardContent className="flex flex-col gap-6 p-0 md:flex-row md:items-center">
          <div className="flex h-20 w-20 items-center justify-center bg-secondary overflow-hidden rounded-full">
            {user.image ? (
              <Image src={user.image} alt={user.name ?? 'Avatar'} width={80} height={80} />
            ) : (
              <span className="text-2xl font-semibold">
                {(user.name || user.email)[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile</p>
            <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em]">{user.name || 'Unnamed'}</h1>
            <p className="text-muted-foreground">{user.email}</p>
            <p className="mt-2 inline-flex rounded-full bg-brand/10 text-brand px-3 py-1 text-xs uppercase tracking-wide border border-brand/20">
              {user.role}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/dashboard/settings">
              <Button variant="outline" className="rounded-lg">
                <Settings size={14} className="mr-2" />
                Edit Settings
              </Button>
            </Link>
            {isAdmin(user) && (
              <Button asChild variant="outline" className="rounded-lg">
                <Link href="/dashboard/admin">Admin Tools</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border p-5 md:p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-lg font-semibold">Account Information</h2>
          <p className="text-sm text-muted-foreground">
            Manage your profile settings, newsletter subscriptions, and preferences from the
            Settings page.
          </p>
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
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
