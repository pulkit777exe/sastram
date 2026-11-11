import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { mockRequest } from '../helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { env } from '@/lib/config/env';

const GET = () => require('@/app/api/cron/daily-digest/route').GET;

describe('GET /api/cron/daily-digest', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('re-checks current thread access before sending and skips a now-private thread', async () => {
    // `verifyCronAuth` reads the cached env proxy, not process.env, so sign the
    // request with the exact secret the route will compare against.
    const secret = env.CRON_SECRET;
    let messagesFetched = false;

    restore = installFakePrisma({
      'threadSubscription.findMany': async () => [
        {
          id: 'sub-1',
          threadId: 'thread-1',
          userId: 'user-1',
          email: null,
          frequency: 'DAILY',
          lastAttemptedAt: null,
          thread: { id: 'thread-1', name: 'Private thread', slug: 'private-thread' },
          user: { email: 'user@example.com', deletedAt: null },
        },
      ],
      'thread.findMany': async () => [
        { id: 'thread-1', createdBy: 'owner-1', visibility: 'PRIVATE' },
      ],
      'user.findMany': async () => [
        { id: 'user-1', email: 'user@example.com', role: 'USER' },
      ],
      'threadInvitation.findMany': async () => [],
      'threadSubscription.update': async () => ({}),
      'message.findMany': async () => {
        messagesFetched = true;
        return [];
      },
    });

    const res = await GET()(
      mockRequest('/api/cron/daily-digest', {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      })
    );
    const body = await res.json();

    expect(res.status).to.equal(200);
    expect(body.data.results.skipped).to.equal(1);
    expect(body.data.results.sent).to.equal(0);
    expect(messagesFetched).to.equal(false);
  });
});
