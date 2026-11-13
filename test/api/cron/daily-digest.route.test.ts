import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { mockRequest } from '../helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { env } from '@/lib/config/env';

const GET = () => require('@/app/api/cron/daily-digest/route').GET;

let restore: (() => void) | null = null;

type FakeRole = 'USER' | 'MODERATOR' | 'ADMIN';
type FakeVisibility = 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';

interface FakeSubscription {
  id: string;
  threadId: string;
  userId: string | null;
  email: string | null;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  lastAttemptedAt: Date | null;
  thread: { id: string; name: string; slug: string };
  user: { email: string | null; deletedAt: Date | null; role: FakeRole } | null;
}

interface FakeThreadRow {
  id: string;
  createdBy: string | null;
  visibility: FakeVisibility;
  invitations?: Array<{ inviteeId: string | null; email: string }>;
}

function subscription(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  const threadId = overrides.threadId ?? 'thread-1';
  return {
    id: 'sub-1',
    threadId,
    userId: 'user-1',
    email: null,
    frequency: 'DAILY',
    lastAttemptedAt: null,
    thread: { id: threadId, name: 'Thread', slug: 'thread' },
    user: { email: 'user@example.com', deletedAt: null, role: 'USER' },
    ...overrides,
  };
}

function threadRow(overrides: Partial<FakeThreadRow> = {}): FakeThreadRow {
  const id = overrides.id ?? 'thread-1';
  return {
    id,
    createdBy: 'owner-1',
    visibility: 'PRIVATE',
    invitations: [],
    ...overrides,
  };
}

type DigestResults = {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  hasMore: boolean;
};

/**
 * Runs the route against fakes. `message.findMany` always returns no rows so
 * an access-approved subscription stops before summary generation/email send;
 * `messageFindMany > 0` is therefore the observable "delivered past the gate".
 */
async function runDigest(options: {
  subscriptions: FakeSubscription[];
  threads: FakeThreadRow[];
}): Promise<{
  status: number;
  results: DigestResults;
  threadFindMany: number;
  messageFindMany: number;
  threadFindManyArgs: unknown[];
}> {
  let threadFindMany = 0;
  let messageFindMany = 0;
  const threadFindManyArgs: unknown[] = [];
  const secret = env.CRON_SECRET;

  restore = installFakePrisma({
    'threadSubscription.findMany': async () => options.subscriptions,
    'thread.findMany': async (...args: never[]) => {
      threadFindMany++;
      threadFindManyArgs.push(args[0]);
      return options.threads;
    },
    // Both were part of the old per-thread access N+1. The route must resolve
    // access from the page-wide thread snapshot instead.
    'user.findMany': async () => {
      throw new Error('daily-digest must not call user.findMany');
    },
    'threadInvitation.findMany': async () => {
      throw new Error('daily-digest must not call threadInvitation.findMany');
    },
    'threadSubscription.update': async () => ({}),
    'message.findMany': async () => {
      messageFindMany++;
      return [];
    },
  });

  const res = await GET()(
    mockRequest('/api/cron/daily-digest', {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    })
  );
  const body = await res.json();

  return {
    status: res.status,
    results: body.data.results as DigestResults,
    threadFindMany,
    messageFindMany,
    threadFindManyArgs,
  };
}

describe('GET /api/cron/daily-digest', () => {
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('skips a private thread for a stranger', async () => {
    const run = await runDigest({
      subscriptions: [subscription()],
      threads: [threadRow()],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.sent).to.equal(0);
    expect(run.results.errors).to.equal(0);
    expect(run.messageFindMany).to.equal(0);
  });

  it('delivers a private thread to its creator', async () => {
    const run = await runDigest({
      subscriptions: [subscription()],
      threads: [threadRow({ createdBy: 'user-1' })],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1); // empty message window stops before send
    expect(run.results.errors).to.equal(0);
    expect(run.messageFindMany).to.equal(1);
  });

  it('delivers a private thread to a moderator', async () => {
    const run = await runDigest({
      subscriptions: [
        subscription({
          user: { email: 'mod@example.com', deletedAt: null, role: 'MODERATOR' },
        }),
      ],
      threads: [threadRow()],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.errors).to.equal(0);
    expect(run.messageFindMany).to.equal(1);
  });

  it('delivers a private thread to an accepted invitee matched by inviteeId', async () => {
    const run = await runDigest({
      subscriptions: [subscription()],
      threads: [
        threadRow({
          invitations: [{ inviteeId: 'user-1', email: 'different@example.com' }],
        }),
      ],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.errors).to.equal(0);
    expect(run.messageFindMany).to.equal(1);
  });

  it('delivers a private thread to an accepted invitation matched by email', async () => {
    const run = await runDigest({
      subscriptions: [subscription()],
      threads: [
        threadRow({
          invitations: [{ inviteeId: null, email: 'user@example.com' }],
        }),
      ],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.errors).to.equal(0);
    expect(run.messageFindMany).to.equal(1);

    // The page-wide prefilter carries both viewer ids and current emails so
    // the invitation relation can be resolved for this page only.
    const serializedQuery = JSON.stringify(run.threadFindManyArgs[0]);
    expect(serializedQuery).to.contain('user-1');
    expect(serializedQuery).to.contain('user@example.com');
  });

  it('skips a subscription whose thread was deleted', async () => {
    const run = await runDigest({
      subscriptions: [subscription()],
      threads: [],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.sent).to.equal(0);
    expect(run.messageFindMany).to.equal(0);
  });

  it('skips a soft-deleted user before resolving thread access', async () => {
    const run = await runDigest({
      subscriptions: [
        subscription({
          user: { email: 'user@example.com', deletedAt: new Date('2024-01-01'), role: 'USER' },
        }),
      ],
      // Creator access would pass; the recipient check must win first.
      threads: [threadRow({ createdBy: 'user-1' })],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.sent).to.equal(0);
    expect(run.messageFindMany).to.equal(0);
  });

  it('skips a private thread for an email-only subscription', async () => {
    const run = await runDigest({
      subscriptions: [subscription({ userId: null, email: 'anon@example.com', user: null })],
      threads: [threadRow({ visibility: 'PRIVATE' })],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1);
    expect(run.results.sent).to.equal(0);
    expect(run.messageFindMany).to.equal(0);

    // With no signed-in viewer on the page the prefilter is PUBLIC-only.
    const where = (run.threadFindManyArgs[0] as { where: Record<string, unknown> }).where;
    expect(where.visibility).to.equal('PUBLIC');
  });

  it('delivers a public thread to an email-only subscription', async () => {
    const run = await runDigest({
      subscriptions: [subscription({ userId: null, email: 'anon@example.com', user: null })],
      threads: [threadRow({ visibility: 'PUBLIC' })],
    });

    expect(run.status).to.equal(200);
    expect(run.results.skipped).to.equal(1); // empty message window stops before send
    expect(run.results.errors).to.equal(0);
    expect(run.messageFindMany).to.equal(1);
  });

  it('resolves a page of multiple subscriptions with exactly one thread.findMany', async () => {
    const run = await runDigest({
      subscriptions: [
        subscription({ id: 'sub-1', threadId: 'thread-1' }),
        subscription({ id: 'sub-2', threadId: 'thread-1' }),
        subscription({
          id: 'sub-3',
          threadId: 'thread-2',
          thread: { id: 'thread-2', name: 'Thread 2', slug: 'thread-2' },
        }),
      ],
      threads: [
        threadRow({ id: 'thread-1', visibility: 'PUBLIC' }),
        threadRow({ id: 'thread-2', visibility: 'PUBLIC' }),
      ],
    });

    expect(run.status).to.equal(200);
    expect(run.threadFindMany).to.equal(1);
    expect(run.results.skipped).to.equal(3);
    expect(run.results.errors).to.equal(0);
    // Memoized per (thread, window): two distinct threads, not three subscriptions.
    expect(run.messageFindMany).to.equal(2);
  });
});
