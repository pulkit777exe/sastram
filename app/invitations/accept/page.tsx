'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type Status = 'loading' | 'checking-auth' | 'accepting' | 'done' | 'error';

export default function InvitationAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteId = searchParams.get('id');

  let initialStatus: Status = 'loading';
  let initialError: string | null = null;
  if (!inviteId) {
    initialStatus = 'error';
    initialError = 'Invalid invitation link — no invitation ID found.';
  }

  const [status, setStatus] = useState<Status>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [threadSlug, setThreadSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteId) return;

    let cancelled = false;

    async function run() {
      setStatus('checking-auth');

      let sessionRes: Response;
      try {
        sessionRes = await fetch('/api/auth/get-session');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setError('Could not verify your session. Please try again.');
        }
        return;
      }

      let sessionData: { session?: unknown } | null = null;
      try {
        sessionData = await sessionRes.json();
      } catch {
        if (!cancelled) {
          setStatus('error');
          setError('Could not verify your session. Please try again.');
        }
        return;
      }

      const hasSession = sessionData && sessionData.session;

      if (!hasSession) {
        const currentUrl = `/invitations/accept?invite=${inviteId}`;
        router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
        return;
      }

      setStatus('accepting');

      try {
        const res = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitationId: inviteId }),
        });

        const data = await res.json();

        if (cancelled) return;

        if (data.error) {
          setStatus('error');
          setError(data.error.message || 'Failed to accept invitation.');
          return;
        }

        const slug = data.data?.threadSlug;
        if (slug) {
          setThreadSlug(slug);
          setStatus('done');
          router.push(`/dashboard/threads/${slug}`);
        } else {
          setStatus('error');
          setError('Something went wrong — no thread slug returned.');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setError('Could not process the invitation. Please try again.');
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [inviteId, router]);

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">Invitation</h1>
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline"
            onClick={() => router.push('/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center space-y-4">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {status === 'loading' && 'Loading invitation...'}
          {status === 'checking-auth' && 'Checking your account...'}
          {status === 'accepting' && 'Accepting invitation...'}
          {status === 'done' && threadSlug && `Redirecting to thread...`}
        </p>
      </div>
    </div>
  );
}
