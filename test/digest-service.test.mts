import { describe, it } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { fetchDigestMessages, generateDigestSummary, getDigestWindow } from '@/lib/services/digest';
import { aiService } from '@/lib/ai';
import { AI_NOT_CONFIGURED_SENTINEL } from '@/lib/services/ai-sentinel';

describe('digest service', () => {
  describe('getDigestWindow', () => {
    const sunday = new Date('2026-10-18T12:00:00');
    const monday = new Date('2026-10-19T12:00:00');
    const firstOfMonth = new Date('2026-10-01T12:00:00');

    it('processes DAILY on any day with a same-day window', () => {
      const window = getDigestWindow('DAILY', monday);
      expect(window?.process).to.equal(true);
      expect(window?.start.getDate()).to.equal(19);
      expect(window?.end.getDate()).to.equal(19);
    });

    it('processes WEEKLY only on Sundays with a 7-day window', () => {
      expect(getDigestWindow('WEEKLY', sunday)?.process).to.equal(true);
      expect(getDigestWindow('WEEKLY', monday)?.process).to.equal(false);
      const window = getDigestWindow('WEEKLY', sunday)!;
      expect(window.start.getDate()).to.equal(12); // Monday Oct 12
      const spanDays = Math.round((window.end.getTime() - window.start.getTime()) / 86_400_000);
      expect(spanDays).to.equal(7);
    });

    it('processes MONTHLY only on the 1st with a 30-day window', () => {
      expect(getDigestWindow('MONTHLY', firstOfMonth)?.process).to.equal(true);
      expect(getDigestWindow('MONTHLY', monday)?.process).to.equal(false);
      const window = getDigestWindow('MONTHLY', firstOfMonth)!;
      expect(window.start.getDate()).to.equal(2); // Sep 2 (29 days before Oct 1)
    });

    it('returns null for NEVER', () => {
      expect(getDigestWindow('NEVER', monday)).to.equal(null);
    });
  });

  describe('fetchDigestMessages', () => {
    it('fetches the newest N messages in the window and returns them chronologically', async () => {
      let findArgs: { take?: number; orderBy?: Record<string, string>; where?: Record<string, unknown> } | undefined;
      const start = new Date('2026-10-18T00:00:00');
      const end = new Date('2026-10-18T23:59:59.999');
      const restore = installFakePrisma({
        'message.findMany': async (args: unknown) => {
          findArgs = args as typeof findArgs;
          return [
            { id: 'm3', content: 'third' },
            { id: 'm2', content: 'second' },
            { id: 'm1', content: 'first' },
          ];
        },
      });
      try {
        const rows = await fetchDigestMessages('thread1', { start, end }, 50);
        expect(rows.map((row) => row.id)).to.deep.equal(['m1', 'm2', 'm3']);
        expect(findArgs?.take).to.equal(50);
        expect(findArgs?.orderBy).to.deep.equal({ createdAt: 'desc' });
        expect(findArgs?.where).to.deep.equal({
          threadId: 'thread1',
          createdAt: { gte: start, lte: end },
        });
      } finally {
        restore();
      }
    });
  });

  describe('generateDigestSummary', () => {
    const replaceGenerate = (impl: () => Promise<string>) => {
      const original = (aiService as unknown as { generateDailyDigest: unknown }).generateDailyDigest;
      (aiService as unknown as { generateDailyDigest: unknown }).generateDailyDigest = impl;
      return () => {
        (aiService as unknown as { generateDailyDigest: unknown }).generateDailyDigest = original;
      };
    };

    it('returns generated html as-is', async () => {
      const restore = replaceGenerate(async () => '<p>digest</p>');
      try {
        expect(await generateDigestSummary([{ content: 'hello' }])).to.equal('<p>digest</p>');
      } finally {
        restore();
      }
    });

    it('returns null when AI is not configured (sentinel is not a digest)', async () => {
      const restore = replaceGenerate(async () => AI_NOT_CONFIGURED_SENTINEL);
      try {
        expect(await generateDigestSummary([{ content: 'hello' }])).to.equal(null);
      } finally {
        restore();
      }
    });
  });
});
