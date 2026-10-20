import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from './helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { parseSSE } from '@/lib/utils/sse';
import { resetRateLimiters } from '@/lib/services/rate-limit';

const ROUTE_PATH = require.resolve('@/app/api/threads/[threadId]/ai-reply/stream/route');
const SERVICE_PATH = require.resolve('@/modules/ai-reply/service');
const GUARD_PATH = require.resolve('@/lib/middleware/ai-guard-route');

const THREAD_ID = 'cklxy00000000000000000000';
const PARENT_ID = 'parent-msg-1';

interface StreamArgs {
  aiMessageId: string;
  onToken?: (chunk: string) => void;
}

interface CreateArgs {
  threadId: string;
  parentId: string;
  parentDepth: number | null | undefined;
  aiUserId: string;
}

interface RouteFakes {
  stream: sinon.SinonStub;
  create: sinon.SinonStub;
  fetchContext: sinon.SinonStub;
  getAiUser: sinon.SinonStub;
}

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

describe('GET /api/threads/[threadId]/ai-reply/stream (idempotency)', () => {
  let stubs: sinon.SinonStub[] = [];
  let restorePrisma: (() => void) | null = null;

  beforeEach(() => {
    resetRateLimiters();
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    if (restorePrisma) {
      restorePrisma();
      restorePrisma = null;
    }
    if (require.cache[GUARD_PATH]) {
      const guardModule = require(GUARD_PATH) as { setGuardDepsForTests: (deps: null) => void };
      guardModule.setGuardDepsForTests(null);
    }
    delete require.cache[ROUTE_PATH];
    delete require.cache[SERVICE_PATH];
    delete require.cache[GUARD_PATH];
  });

  function installFakes(
    parent: unknown,
    existing: unknown | null,
    options: {
      streamError?: Error;
      aiContent?: string | null;
      onUpdate?: (args: unknown) => void;
    } = {}
  ): RouteFakes {
    const stream = sinon.stub();
    if (options.streamError) {
      stream.rejects(options.streamError);
    } else {
      stream.callsFake(async (args: StreamArgs) => {
        args.onToken?.('hello ');
        args.onToken?.('world');
        return { content: 'hello world', truncated: false, isFallback: false };
      });
    }
    const create = sinon.stub().callsFake(async (args: CreateArgs) => ({
      id: 'new-ai-msg',
      depth: Math.min((args.parentDepth ?? 0) + 1, 4),
    }));
    const fetchContext = sinon.stub().resolves('thread context');
    const getAiUser = sinon.stub().resolves({ id: 'ai-user', name: 'Sastram AI', image: null });

    delete require.cache[SERVICE_PATH];
    stubModule(SERVICE_PATH, {
      fetchThreadContext: fetchContext,
      getOrCreateAiUser: getAiUser,
      createAiReplyMessageTx: create,
      streamAiReplyToMessage: stream,
    });

    restorePrisma = installFakePrisma({
      'message.findFirst': async (args: { where?: { parentId?: string } }) =>
        args?.where?.parentId !== undefined ? existing : parent,
      'message.findUnique': async () => ({ content: options.aiContent ?? '' }),
      'message.update': async (args: unknown) => {
        options.onUpdate?.(args);
        return { id: 'new-ai-msg' };
      },
    });

    const guardModule = require(GUARD_PATH) as {
      setGuardDepsForTests: (deps: unknown) => void;
      allowAllGuardDeps: () => unknown;
    };
    guardModule.setGuardDepsForTests(guardModule.allowAllGuardDeps());

    delete require.cache[ROUTE_PATH];
    return { stream, create, fetchContext, getAiUser };
  }

  async function callRoute(): Promise<Response> {
    const { GET } = require(ROUTE_PATH) as {
      GET: (
        request: Request,
        context: { params: Promise<{ threadId: string }> }
      ) => Promise<Response>;
    };
    return GET(
      mockRequest(`/api/threads/${THREAD_ID}/ai-reply/stream?messageId=${PARENT_ID}`),
      { params: Promise.resolve({ threadId: THREAD_ID }) }
    );
  }

  it('replays an existing non-empty AI reply without creating a message or calling the LLM', async () => {
    const existingReply = {
      id: 'existing-ai-msg',
      content: 'Previously generated answer.',
      depth: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      senderId: 'ai-user',
      sender: { name: 'Sastram AI', image: null },
    };
    const fakes = installFakes(
      { id: PARENT_ID, content: '@sai what is this?', depth: 0 },
      existingReply
    );

    const response = await callRoute();
    expect(response.status).to.equal(200);

    const { events } = parseSSE(await response.text());
    expect(events.map((event) => event.event)).to.deep.equal(['start', 'token', 'done']);
    expect(JSON.parse(events[0].data).messageId).to.equal('existing-ai-msg');
    expect(JSON.parse(events[0].data).depth).to.equal(1);
    expect(JSON.parse(events[1].data).content).to.equal('Previously generated answer.');
    expect(JSON.parse(events[2].data)).to.deep.include({ messageId: 'existing-ai-msg', truncated: false });

    sinon.assert.notCalled(fakes.stream);
    sinon.assert.notCalled(fakes.create);
    sinon.assert.notCalled(fakes.fetchContext);
  });

  it('streams into an existing empty AI reply instead of creating a duplicate', async () => {
    const existingReply = {
      id: 'existing-empty-msg',
      content: '   ',
      depth: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      senderId: 'ai-user',
      sender: { name: 'Sastram AI', image: null },
    };
    const fakes = installFakes(
      { id: PARENT_ID, content: '@sai what is this?', depth: 0 },
      existingReply
    );

    const response = await callRoute();
    const { events } = parseSSE(await response.text());

    expect(events.map((event) => event.event)).to.deep.equal(['start', 'token', 'token', 'done']);
    expect(JSON.parse(events[0].data).messageId).to.equal('existing-empty-msg');
    sinon.assert.calledOnce(fakes.stream);
    expect(fakes.stream.firstCall.args[0].aiMessageId).to.equal('existing-empty-msg');
    sinon.assert.notCalled(fakes.create);
  });

  it('creates a new AI reply message and streams when none exists (depth folded into parent lookup)', async () => {
    const fakes = installFakes({ id: PARENT_ID, content: '@sai why?', depth: 2 }, null);

    const response = await callRoute();
    const { events } = parseSSE(await response.text());

    expect(events.map((event) => event.event)).to.deep.equal(['start', 'token', 'token', 'done']);
    expect(JSON.parse(events[0].data).messageId).to.equal('new-ai-msg');
    expect(JSON.parse(events[0].data).depth).to.equal(3);
    sinon.assert.calledOnce(fakes.create);
    expect(fakes.create.firstCall.args[0]).to.deep.include({
      threadId: THREAD_ID,
      parentId: PARENT_ID,
      parentDepth: 2,
      aiUserId: 'ai-user',
    });
    sinon.assert.calledOnce(fakes.stream);
  });

  it('sends terminal error content and persists it when generation fails', async () => {
    let persisted: unknown;
    installFakes(
      { id: PARENT_ID, content: '@sai why?', depth: 0 },
      null,
      {
        streamError: new Error('API key not valid. Please pass a valid API key. (UNAUTHENTICATED)'),
        onUpdate: (args) => {
          persisted = args;
        },
      }
    );

    const response = await callRoute();
    const { events } = parseSSE(await response.text());

    expect(events.map((event) => event.event)).to.deep.equal(['start', 'error']);
    const errorPayload = JSON.parse(events[1].data);
    expect(errorPayload.messageId).to.equal('new-ai-msg');
    expect(errorPayload.error).to.equal('Generation failed');
    expect(errorPayload.content).to.contain('API key');
    expect(persisted).to.deep.equal({
      where: { id: 'new-ai-msg' },
      data: { content: errorPayload.content },
    });
  });
});
