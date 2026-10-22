import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';

const queueModulePath = require.resolve('@/lib/services/queue');
const emailModulePath = require.resolve('@/lib/services/email');

type EmailModule = typeof import('@/lib/services/email');
type QueueModule = typeof import('@/lib/services/queue');

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

describe('sendEmail queue failures', () => {
  let originalQueueModule: NodeModule | undefined;

  beforeEach(() => {
    originalQueueModule = require.cache[queueModulePath];
  });

  afterEach(() => {
    if (originalQueueModule) {
      require.cache[queueModulePath] = originalQueueModule;
    } else {
      delete require.cache[queueModulePath];
    }
    delete require.cache[emailModulePath];
  });

  function loadEmail(enqueueJob: QueueModule['enqueueJob']): EmailModule {
    stubModule(queueModulePath, { enqueueJob });
    delete require.cache[emailModulePath];
    return require(emailModulePath) as EmailModule;
  }

  it('throws when the email job was not queued or executed', async () => {
    const { sendEmail } = loadEmail(async () => ({ status: 'dropped', ok: false }));

    let thrown: unknown;
    try {
      await sendEmail({ to: 'user@example.com', subject: 'Your code', text: '123456', type: 'otp-sign-in' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((thrown as Error).message).to.contain('Failed to enqueue otp-sign-in email');
  });

  it('returns a receipt when the job was published or ran inline', async () => {
    const { sendEmail } = loadEmail(async () => ({ status: 'published', ok: true }));

    const result = await sendEmail({ to: 'user@example.com', subject: 'Welcome', text: 'Hello' });

    expect(result.id).to.match(/^email-/);
  });
});
