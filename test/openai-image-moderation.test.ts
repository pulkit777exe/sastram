import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { OpenAIService } from '@/lib/ai/openai';

function moderationResponse(payload: {
  flagged: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
}) {
  return new Response(JSON.stringify({ results: [payload] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAIService image moderation', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('sends the image to the multimodal moderation endpoint', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(
      moderationResponse({
        flagged: false,
        categories: { sexual: false, violence: false },
        category_scores: { sexual: 0.01, violence: 0.02 },
      })
    );

    const result = await new OpenAIService('test-key').moderateImageContent('https://blob.example/image.png');

    expect(result.classification).to.equal('SAFE');
    expect(result.confidence).to.be.closeTo(0.98, 0.001);
    expect(fetchStub.calledOnce).to.equal(true);

    const [url, init] = fetchStub.firstCall.args;
    expect(url).to.equal('https://api.openai.com/v1/moderations');
    const body = JSON.parse(String(init?.body));
    expect(body.model).to.equal('omni-moderation-latest');
    expect(body.input).to.deep.equal([
      { type: 'image_url', image_url: { url: 'https://blob.example/image.png' } },
    ]);
  });

  it('classifies flagged images as NSFW and names the categories', async () => {
    sinon.stub(globalThis, 'fetch').resolves(
      moderationResponse({
        flagged: true,
        categories: { sexual: true, violence: false },
        category_scores: { sexual: 0.93, violence: 0.05 },
      })
    );

    const result = await new OpenAIService('test-key').moderateImageContent('https://blob.example/nsfw.png');

    expect(result.classification).to.equal('NSFW');
    expect(result.confidence).to.be.closeTo(0.93, 0.001);
    expect(result.reason).to.contain('sexual');
  });
});
