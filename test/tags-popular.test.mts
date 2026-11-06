import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { getPopularTags } from '@/modules/tags/repository';

describe('getPopularTags visibility counts', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('ranks by the visibility-filtered groupBy count and fetches metadata once', async () => {
    const groupByArgs: unknown[] = [];
    let findManyCalls = 0;

    restore = installFakePrisma({
      'threadTagRelation.groupBy': async (args: unknown) => {
        groupByArgs.push(args);
        return [
          { tagId: 'tag-b', _count: { tagId: 7 } },
          { tagId: 'tag-a', _count: { tagId: 2 } },
          { tagId: 'tag-empty', _count: { tagId: 0 } },
        ];
      },
      'threadTag.findMany': async () => {
        findManyCalls += 1;
        return [
          { id: 'tag-a', name: 'A', slug: 'a', color: '#000000', createdAt: new Date(0) },
          { id: 'tag-b', name: 'B', slug: 'b', color: '#111111', createdAt: new Date(0) },
          { id: 'tag-empty', name: 'Empty', slug: 'empty', color: '#222222', createdAt: new Date(0) },
        ];
      },
    });

    const tags = await getPopularTags(2);

    expect(tags.map((tag) => tag.id)).to.deep.equal(['tag-b', 'tag-a']);
    expect(tags.map((tag) => tag.threadCount)).to.deep.equal([7, 2]);
    expect(findManyCalls).to.equal(1);
    expect(groupByArgs).to.have.lengthOf(1);
    expect((groupByArgs[0] as { where: unknown }).where).to.deep.equal({
      thread: { deletedAt: null, visibility: 'PUBLIC' },
    });
  });
});
