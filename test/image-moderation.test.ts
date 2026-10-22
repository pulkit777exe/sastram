import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

const imageModerationPath = require.resolve('@/lib/services/image-moderation');
const blobPath = require.resolve('@vercel/blob');
const aiPath = require.resolve('@/lib/ai');
const envPath = require.resolve('@/lib/config/env');
const quotaPath = require.resolve('@/lib/services/daily-quota');
const spendCapPath = require.resolve('@/lib/services/ai-spend-cap');

type ImageModerationModule = typeof import('@/lib/services/image-moderation');

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

describe('image moderation', () => {
  const originals = new Map<string, NodeModule | undefined>();

  function remember(path: string) {
    if (!originals.has(path)) originals.set(path, require.cache[path]);
  }

  function load(options: {
    del: sinon.SinonStub;
    consumeQuota: sinon.SinonStub;
    consumeSpendCap: sinon.SinonStub;
    moderateImageContent: sinon.SinonStub;
    moderationEnabled?: boolean;
  }): ImageModerationModule {
    remember(blobPath);
    remember(aiPath);
    remember(envPath);
    remember(quotaPath);
    remember(spendCapPath);
    remember(imageModerationPath);

    stubModule(blobPath, { del: options.del });
    stubModule(aiPath, { aiService: { moderateImageContent: options.moderateImageContent } });
    stubModule(envPath, { env: { CONTENT_MODERATION_ENABLED: options.moderationEnabled ?? true } });
    stubModule(quotaPath, { consumeQuota: options.consumeQuota });
    stubModule(spendCapPath, { consumeSpendCap: options.consumeSpendCap });
    delete require.cache[imageModerationPath];
    return require(imageModerationPath) as ImageModerationModule;
  }

  afterEach(() => {
    for (const [path, original] of originals) {
      if (original) require.cache[path] = original;
      else delete require.cache[path];
    }
    originals.clear();
    sinon.restore();
  });

  it('fails closed and deletes the blob when classification is UNKNOWN', async () => {
    const del = sinon.stub().resolves();
    const consumeQuota = sinon.stub().resolves({ allowed: true, remaining: 19 });
    const consumeSpendCap = sinon.stub().resolves({ allowed: true, remaining: 1 });
    const moderateImageContent = sinon.stub().resolves({
      classification: 'UNKNOWN',
      confidence: 0,
      reason: 'provider uncertainty',
    });

    const { moderateImageUpload } = load({
      del,
      consumeQuota,
      consumeSpendCap,
      moderateImageContent,
    });

    const url = 'https://blob.example/unverified.png';
    const result = await moderateImageUpload(url, 'IMAGE', 'user-1');

    expect(result.allowed).to.equal(false);
    expect(result.reason).to.contain('Image rejected');
    expect(del.calledOnceWith(url)).to.equal(true);
    expect(consumeQuota.calledOnceWith('image', { userId: 'user-1' })).to.equal(true);
  });

  it('does not call the provider or consume quota when moderation is disabled', async () => {
    const del = sinon.stub().resolves();
    const consumeQuota = sinon.stub();
    const consumeSpendCap = sinon.stub();
    const moderateImageContent = sinon.stub();

    const { moderateImageUpload } = load({
      del,
      consumeQuota,
      consumeSpendCap,
      moderateImageContent,
      moderationEnabled: false,
    });

    const result = await moderateImageUpload('https://blob.example/safe.png', 'IMAGE', 'user-1');

    expect(result).to.deep.equal({ allowed: true });
    expect(consumeQuota.called).to.equal(false);
    expect(moderateImageContent.called).to.equal(false);
    expect(del.called).to.equal(false);
  });
});
