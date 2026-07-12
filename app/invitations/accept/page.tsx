'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type Status = 'loading' | 'checking-auth' | 'accepting' | 'done' | 'error';

export default function InvitationAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteId = searchParams.get('id');

  const [status, setStatus] = useState<Status>(inviteId ? 'loading' : 'error');
  const [error, setError] = useState<string | null>(
    inviteId ? null : 'Invalid invitation link — no invitation ID found.'
  );
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
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">Invitation</h1>
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center space-y-4">
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
