import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { Role, ThreadVisibility } from '@prisma/client';
import {
  canAccessThread,
  canReadThread,
  visibilityFilter,
  canWriteToThread,
  canManageThread,
  requireReadOrThrow,
  requireWriteOrThrow,
  requireManageOrThrow,
  filterReadableUserIds,
  canReadFromSnapshot,
  buildBatchVisibilityFilter,
  createThreadAccessPolicy,
  createFakeThreadAccessStore,
  type ThreadAccessContext,
  type ThreadReadSnapshot,
  type ThreadViewerSnapshot,
} from '../lib/thread-access';
import {
  canManageView,
  canEditMessageView,
  canDeleteMessageView,
  canPinMessageView,
} from '../lib/thread-access/client';
import { AppError } from '../lib/utils/errors';

// Prisma proxy methods can't be safely stubbed with sinon — route all fakes
// through the shared helper (save/assign/restore with interception).
import { installFakePrisma } from '@/test/support/fake-prisma';

const prismaRestores: (() => void)[] = [];

function mockPrismaThreadInvitationFindFirst(result: unknown) {
  prismaRestores.push(installFakePrisma({ 'threadInvitation.findFirst': async () => result }));
}

function mockPrismaUserFindUnique(result: unknown) {
  prismaRestores.push(installFakePrisma({ 'user.findUnique': async () => result }));
}

function mockPrismaUserBanFindFirst(result: unknown) {
  prismaRestores.push(installFakePrisma({ 'userBan.findFirst': async () => result }));
}

function mockPrismaThreadFindUnique(result: unknown) {
  prismaRestores.push(installFakePrisma({ 'thread.findUnique': async () => result }));
}

function restorePrismaMocks() {
  while (prismaRestores.length) prismaRestores.pop()!();
}

describe('Thread Access', () => {
  afterEach(() => {
    restorePrismaMocks();
  });

  describe('canAccessThread', () => {
    const baseThread: ThreadAccessContext = {
      threadId: 'thread-1',
      createdBy: 'user-1',
      visibility: 'PRIVATE' as ThreadVisibility,
    };

    it('should return true for PUBLIC threads regardless of userId', async () => {
      const publicThread: ThreadAccessContext = {
        ...baseThread,
        visibility: 'PUBLIC',
      };
      expect(await canAccessThread(publicThread, null, null)).to.be.true;
      expect(await canAccessThread(publicThread, 'any-user', Role.USER)).to.be.true;
    });

    it('should return false if userId is null/undefined for non-public threads', async () => {
      expect(await canAccessThread(baseThread, null, null)).to.be.false;
      expect(await canAccessThread(baseThread, undefined, null)).to.be.false;
    });

    it('should return true for MODERATOR role', async () => {
      expect(await canAccessThread(baseThread, 'user-2', Role.MODERATOR)).to.be.true;
    });

    it('should return true for ADMIN role', async () => {
      expect(await canAccessThread(baseThread, 'user-2', Role.ADMIN)).to.be.true;
    });

    it('should return true if user is the thread creator', async () => {
      expect(await canAccessThread(baseThread, 'user-1', Role.USER)).to.be.true;
    });

    it('should return true if user has an accepted invitation (inviteeId or email match, one lookup)', async () => {
      mockPrismaThreadInvitationFindFirst({ id: 'inv-1' });
      mockPrismaUserFindUnique({ email: 'user@example.com' });
      expect(await canAccessThread(baseThread, 'user-2', Role.USER)).to.be.true;
    });

    it('should return true if user has an accepted invitation matched by email (pre-migration row)', async () => {
      mockPrismaThreadInvitationFindFirst({ id: 'inv-2' });
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      expect(await canAccessThread(baseThread, 'user-2', Role.USER)).to.be.true;
    });

    it('should return false if user has no invitation', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      expect(await canAccessThread(baseThread, 'user-2', Role.USER)).to.be.false;
    });

    it('should return false if user does not exist', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique(null);

      expect(await canAccessThread(baseThread, 'user-2', Role.USER)).to.be.false;
    });
  });

  describe('filterReadableUserIds', () => {
    const publicThread: ThreadAccessContext = {
      threadId: 'thread-1',
      createdBy: 'user-1',
      visibility: 'PUBLIC' as ThreadVisibility,
    };
    const privateThread: ThreadAccessContext = {
      ...publicThread,
      visibility: 'PRIVATE' as ThreadVisibility,
    };

    it('returns every subscriber for a public thread without querying access tables', async () => {
      prismaRestores.push(
        installFakePrisma({
          'user.findMany': async () => {
            throw new Error('public threads must not query users');
          },
          'threadInvitation.findMany': async () => {
            throw new Error('public threads must not query invitations');
          },
        })
      );

      expect(await filterReadableUserIds(publicThread, ['u1', 'u2'])).to.deep.equal(['u1', 'u2']);
    });

    it('keeps only creators, moderators, and accepted invitees', async () => {
      const users = [
        { id: 'creator', email: 'creator@example.com', role: Role.USER },
        { id: 'moderator', email: 'mod@example.com', role: Role.MODERATOR },
        { id: 'invitee-by-id', email: 'invitee-by-id@example.com', role: Role.USER },
        { id: 'email-invitee', email: 'invitee@example.com', role: Role.USER },
        { id: 'invitee-no-email', email: null, role: Role.USER },
        { id: 'stranger', email: 'stranger@example.com', role: Role.USER },
      ];
      prismaRestores.push(
        installFakePrisma({
          'user.findMany': async () => users,
          'threadInvitation.findMany': async () => [
            { inviteeId: 'invitee-by-id', email: 'invitee-by-id@example.com' },
            { inviteeId: null, email: 'invitee@example.com' },
            { inviteeId: 'invitee-no-email', email: null },
          ],
        })
      );

      const allowed = await filterReadableUserIds(
        { ...privateThread, createdBy: 'creator' },
        users.map((user) => user.id)
      );

      expect(allowed).to.have.members([
        'creator',
        'moderator',
        'invitee-by-id',
        'email-invitee',
        'invitee-no-email',
      ]);
      expect(allowed).to.not.include('stranger');
    });

    it('deduplicates requested ids and drops users that no longer exist', async () => {
      prismaRestores.push(
        installFakePrisma({
          'user.findMany': async () => [
            { id: 'creator', email: 'creator@example.com', role: Role.USER },
          ],
          'threadInvitation.findMany': async () => [],
        })
      );

      const allowed = await filterReadableUserIds(
        { ...privateThread, createdBy: 'creator' },
        ['creator', 'creator', 'deleted-user']
      );

      expect(allowed).to.deep.equal(['creator']);
    });

    it('returns an empty set for a private thread with no subscribers', async () => {
      expect(await filterReadableUserIds(privateThread, [])).to.deep.equal([]);
    });
  });

  describe('canReadFromSnapshot', () => {
    const snapshot = (overrides: Partial<ThreadReadSnapshot> = {}): ThreadReadSnapshot => ({
      threadId: 'thread-1',
      createdBy: 'user-1',
      visibility: 'PRIVATE' as ThreadVisibility,
      acceptedInvitations: [],
      ...overrides,
    });
    const viewer = (overrides: Partial<ThreadViewerSnapshot> = {}): ThreadViewerSnapshot => ({
      id: 'user-2',
      email: 'viewer@example.com',
      role: Role.USER,
      ...overrides,
    });

    const matrix: Array<{
      name: string;
      visibility: ThreadVisibility;
      viewer: ThreadViewerSnapshot | null;
      invitations?: { inviteeId: string | null; email: string }[];
      expected: boolean;
    }> = [
      { name: 'anonymous on PUBLIC', visibility: 'PUBLIC', viewer: null, expected: true },
      { name: 'stranger on PUBLIC', visibility: 'PUBLIC', viewer: viewer(), expected: true },
      { name: 'anonymous on PRIVATE', visibility: 'PRIVATE', viewer: null, expected: false },
      { name: 'anonymous on RESTRICTED', visibility: 'RESTRICTED', viewer: null, expected: false },
      { name: 'empty-id viewer on PRIVATE', visibility: 'PRIVATE', viewer: viewer({ id: '' }), expected: false },
      { name: 'creator on PRIVATE', visibility: 'PRIVATE', viewer: viewer({ id: 'user-1' }), expected: true },
      { name: 'creator on RESTRICTED', visibility: 'RESTRICTED', viewer: viewer({ id: 'user-1' }), expected: true },
      {
        name: 'moderator on PRIVATE',
        visibility: 'PRIVATE',
        viewer: viewer({ role: Role.MODERATOR }),
        expected: true,
      },
      {
        name: 'admin on RESTRICTED',
        visibility: 'RESTRICTED',
        viewer: viewer({ role: Role.ADMIN }),
        expected: true,
      },
      {
        name: 'invitee by id on PRIVATE',
        visibility: 'PRIVATE',
        viewer: viewer(),
        invitations: [{ inviteeId: 'user-2', email: 'other@example.com' }],
        expected: true,
      },
      {
        name: 'invitee by email on PRIVATE',
        visibility: 'PRIVATE',
        viewer: viewer(),
        invitations: [{ inviteeId: null, email: 'viewer@example.com' }],
        expected: true,
      },
      {
        name: 'invitee by email on RESTRICTED',
        visibility: 'RESTRICTED',
        viewer: viewer(),
        invitations: [{ inviteeId: null, email: 'viewer@example.com' }],
        expected: true,
      },
      {
        name: 'email match is exact (case-sensitive)',
        visibility: 'PRIVATE',
        viewer: viewer(),
        invitations: [{ inviteeId: null, email: 'Viewer@example.com' }],
        expected: false,
      },
      {
        name: 'viewer without email cannot match an email invitation',
        visibility: 'PRIVATE',
        viewer: viewer({ email: null }),
        invitations: [{ inviteeId: null, email: 'viewer@example.com' }],
        expected: false,
      },
      { name: 'stranger on PRIVATE', visibility: 'PRIVATE', viewer: viewer(), expected: false },
      { name: 'stranger on RESTRICTED', visibility: 'RESTRICTED', viewer: viewer(), expected: false },
    ];

    for (const row of matrix) {
      it(`${row.name}: ${row.expected}`, () => {
        expect(
          canReadFromSnapshot(
            snapshot({ visibility: row.visibility, acceptedInvitations: row.invitations ?? [] }),
            row.viewer
          )
        ).to.equal(row.expected);
      });
    }

    it('denies when the thread row is missing (deleted thread)', () => {
      expect(canReadFromSnapshot(null, viewer())).to.equal(false);
      expect(canReadFromSnapshot(null, null)).to.equal(false);
    });

    it('only consults accepted invitations carried by the snapshot', () => {
      expect(canReadFromSnapshot(snapshot(), viewer())).to.equal(false);
      expect(
        canReadFromSnapshot(
          snapshot({ acceptedInvitations: [{ inviteeId: 'someone-else', email: 'other@example.com' }] }),
          viewer()
        )
      ).to.equal(false);
    });
  });

  describe('buildBatchVisibilityFilter', () => {
    const viewer = (overrides: Partial<ThreadViewerSnapshot> = {}): ThreadViewerSnapshot => ({
      id: 'user-2',
      email: 'viewer@example.com',
      role: Role.USER,
      ...overrides,
    });

    type InvitationClause = {
      status?: string;
      OR?: Array<{ inviteeId?: { in: string[] }; email?: { in: string[] } }>;
    };
    type BatchFilter = {
      id?: { in: string[] };
      deletedAt?: null;
      visibility?: string;
      OR?: Array<{
        visibility?: string;
        createdBy?: { in: string[] };
        invitations?: { some: InvitationClause };
      }>;
    };
    const asBatchFilter = (filter: unknown): BatchFilter => filter as BatchFilter;
    const invitationClause = (filter: BatchFilter): InvitationClause => {
      const clause = filter.OR?.find((row) => row.invitations !== undefined)?.invitations?.some;
      expect(clause).to.exist;
      return clause!;
    };

    it('always scopes to the page thread ids and excludes deleted threads', () => {
      const filter = asBatchFilter(buildBatchVisibilityFilter([viewer()], ['t1', 't2']));
      expect(filter.id).to.deep.equal({ in: ['t1', 't2'] });
      expect(filter.deletedAt).to.equal(null);
    });

    it('returns PUBLIC-only candidates when the page has no viewers', () => {
      expect(buildBatchVisibilityFilter([], ['t1'])).to.deep.equal({
        id: { in: ['t1'] },
        deletedAt: null,
        visibility: 'PUBLIC',
      });
    });

    it('treats viewers without ids like no viewers', () => {
      expect(buildBatchVisibilityFilter([viewer({ id: '' })], ['t1'])).to.deep.equal({
        id: { in: ['t1'] },
        deletedAt: null,
        visibility: 'PUBLIC',
      });
    });

    it('drops all visibility conditions when any viewer can moderate', () => {
      const base = { id: { in: ['t1'] }, deletedAt: null };
      expect(buildBatchVisibilityFilter([viewer({ role: Role.MODERATOR })], ['t1'])).to.deep.equal(base);
      expect(buildBatchVisibilityFilter([viewer({ role: Role.ADMIN })], ['t1'])).to.deep.equal(base);
      expect(
        buildBatchVisibilityFilter([viewer(), viewer(), viewer({ role: Role.MODERATOR })], ['t1'])
      ).to.deep.equal(base);
    });

    it('includes public, creator, and accepted-invitation candidates for regular viewers', () => {
      const filter = asBatchFilter(
        buildBatchVisibilityFilter(
          [
            viewer({ id: 'user-1', email: 'one@example.com' }),
            viewer({ id: 'user-2', email: 'two@example.com' }),
          ],
          ['t1']
        )
      );
      expect(filter.OR).to.have.lengthOf(3);
      expect(filter.OR![0]).to.deep.equal({ visibility: 'PUBLIC' });
      expect(filter.OR![1]).to.deep.equal({ createdBy: { in: ['user-1', 'user-2'] } });
      expect(filter.OR![2]).to.deep.equal({
        invitations: {
          some: {
            status: 'ACCEPTED',
            OR: [
              { inviteeId: { in: ['user-1', 'user-2'] } },
              { email: { in: ['one@example.com', 'two@example.com'] } },
            ],
          },
        },
      });
    });

    it('deduplicates viewer ids and emails', () => {
      const filter = asBatchFilter(
        buildBatchVisibilityFilter(
          [
            viewer({ id: 'user-1', email: 'one@example.com' }),
            viewer({ id: 'user-1', email: 'one@example.com' }),
            viewer({ id: 'user-2', email: 'two@example.com' }),
            viewer({ id: 'user-2', email: 'two@example.com' }),
          ],
          ['t1']
        )
      );

      expect(filter.OR![1]).to.deep.equal({ createdBy: { in: ['user-1', 'user-2'] } });
      expect(invitationClause(filter).OR).to.deep.equal([
        { inviteeId: { in: ['user-1', 'user-2'] } },
        { email: { in: ['one@example.com', 'two@example.com'] } },
      ]);
    });

    it('omits null/empty emails from the invitation clause', () => {
      const filter = asBatchFilter(
        buildBatchVisibilityFilter(
          [viewer({ id: 'user-1', email: null }), viewer({ id: 'user-2', email: '' })],
          ['t1']
        )
      );

      expect(invitationClause(filter).status).to.equal('ACCEPTED');
      expect(invitationClause(filter).OR).to.deep.equal([{ inviteeId: { in: ['user-1', 'user-2'] } }]);
    });
  });

  describe('visibilityFilter', () => {
    it('should return empty filter for MODERATOR', async () => {
      const filter = await visibilityFilter('user-1', Role.MODERATOR);
      expect(filter).to.deep.equal({});
    });

    it('should return empty filter for ADMIN', async () => {
      const filter = await visibilityFilter('user-1', Role.ADMIN);
      expect(filter).to.deep.equal({});
    });

    it('should return PUBLIC only filter if no userId', async () => {
      const filter = await visibilityFilter(undefined, Role.USER);
      expect(filter).to.deep.equal({ visibility: 'PUBLIC' });
    });

    it('should return OR filter for regular user', async () => {
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      const filter = await visibilityFilter('user-1', Role.USER);
      expect(filter).to.have.property('OR');
      expect(filter.OR).to.be.an('array').with.lengthOf(3);
      expect(filter.OR).to.deep.include({ visibility: 'PUBLIC' });
      expect(filter.OR).to.deep.include({ createdBy: 'user-1' });
    });

    it('should include email match in invitation filter if user has email', async () => {
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      const filter = await visibilityFilter('user-1', Role.USER);
      type FilterWithInvitations = { invitations?: { some: { OR: unknown[] } } };
      const invitationFilter = (filter.OR as unknown as FilterWithInvitations[]).find((f) => f.invitations);
      expect(invitationFilter).to.exist;
      expect((invitationFilter as unknown as { invitations: { some: { OR: unknown[] } } }).invitations.some.OR).to.deep.include({ email: 'user@example.com' });
    });

    it('should not include email match if user has no email', async () => {
      mockPrismaUserFindUnique({ email: null });

      const filter = await visibilityFilter('user-1', Role.USER);
      type FilterWithInvitations = { invitations?: { some: { OR: unknown[] } } };
      const invitationFilter = (filter.OR as unknown as FilterWithInvitations[]).find((f) => f.invitations);
      expect(invitationFilter).to.exist;
      expect((invitationFilter as unknown as { invitations: { some: { OR: unknown[] } } }).invitations.some.OR).to.have.lengthOf(1);
      expect((invitationFilter as unknown as { invitations: { some: { OR: unknown[] } } }).invitations.some.OR).to.deep.include({ inviteeId: 'user-1' });
    });
  });

  describe('canWriteToThread', () => {
    const baseThread: ThreadAccessContext = {
      threadId: 'thread-1',
      createdBy: 'user-1',
      visibility: 'PRIVATE' as ThreadVisibility,
    };

    beforeEach(() => {
      mockPrismaUserBanFindFirst(null);
    });

    it('should return true for MODERATOR', async () => {
      expect(await canWriteToThread(baseThread, 'user-2', Role.MODERATOR)).to.be.true;
    });

    it('should return true for ADMIN', async () => {
      expect(await canWriteToThread(baseThread, 'user-2', Role.ADMIN)).to.be.true;
    });

    it('should return true for PUBLIC threads', async () => {
      const publicThread: ThreadAccessContext = { ...baseThread, visibility: 'PUBLIC' };
      expect(await canWriteToThread(publicThread, 'user-2', Role.USER)).to.be.true;
    });

    it('should delegate to canAccessThread for non-public threads', async () => {
      mockPrismaThreadInvitationFindFirst({ id: 'inv-1' });
      mockPrismaUserFindUnique({ email: 'user@example.com' });
      expect(await canWriteToThread(baseThread, 'user-2', Role.USER)).to.be.true;
    });

    it('should return false if canAccessThread returns false', async () => {
      mockPrismaUserBanFindFirst(null);
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });
      expect(await canWriteToThread(baseThread, 'user-2', Role.USER)).to.be.false;
    });

    it('should return false for a banned user even on PUBLIC threads', async () => {
      mockPrismaUserBanFindFirst({ id: 'ban-1' });
      const publicThread: ThreadAccessContext = { ...baseThread, visibility: 'PUBLIC' };
      expect(await canWriteToThread(publicThread, 'user-2', Role.USER)).to.be.false;
    });

    it('should return false for a banned thread creator', async () => {
      mockPrismaUserBanFindFirst({ id: 'ban-1' });
      const publicThread: ThreadAccessContext = { ...baseThread, visibility: 'PUBLIC' };
      expect(await canWriteToThread(publicThread, 'user-1', Role.USER)).to.be.false;
    });

    it('should return true for MODERATOR despite a ban row (global bypass)', async () => {
      mockPrismaUserBanFindFirst({ id: 'ban-1' });
      expect(await canWriteToThread(baseThread, 'mod-1', Role.MODERATOR)).to.be.true;
    });
  });

  describe('write bans (UserBan blocks participation, not visibility)', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PUBLIC',
      });
    });

    it('requireWriteOrThrow throws FORBIDDEN for a banned writer', async () => {
      mockPrismaUserBanFindFirst({ id: 'ban-1' });
      try {
        await requireWriteOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('FORBIDDEN');
      }
    });

    it('requireReadOrThrow still allows a banned reader (reads unaffected)', async () => {
      await requireReadOrThrow(threadId, 'user-2', Role.USER);
    });

    it('fake store: thread-scoped and site-wide bans deny writes', async () => {
      const policy = createThreadAccessPolicy(
        createFakeThreadAccessStore({
          threads: [
            { threadId: 't1', createdBy: 'user-1', visibility: 'PUBLIC' as ThreadVisibility },
            { threadId: 't2', createdBy: 'user-1', visibility: 'PUBLIC' as ThreadVisibility },
          ],
          bans: [
            { threadId: 't1', userId: 'user-2' },
            { threadId: null, userId: 'user-3' },
            { threadId: 't1', userId: 'user-4', expiresAt: new Date(Date.now() - 1000) },
          ],
        })
      );
      const t1 = { threadId: 't1', createdBy: 'user-1', visibility: 'PUBLIC' as ThreadVisibility };
      const t2 = { threadId: 't2', createdBy: 'user-1', visibility: 'PUBLIC' as ThreadVisibility };
      expect(await policy.canWrite(t1, 'user-2', Role.USER)).to.equal(false);
      expect(await policy.canWrite(t2, 'user-2', Role.USER)).to.equal(true);
      expect(await policy.canWrite(t1, 'user-3', Role.USER)).to.equal(false);
      expect(await policy.canWrite(t2, 'user-3', Role.USER)).to.equal(false);
      expect(await policy.canWrite(t1, 'user-4', Role.USER)).to.equal(true);
      expect(await policy.canWrite(t1, 'user-9', Role.USER)).to.equal(true);
    });
  });

  describe('canManageThread', () => {
    const baseThread: ThreadAccessContext = {
      threadId: 'thread-1',
      createdBy: 'user-1',
      visibility: 'PRIVATE' as ThreadVisibility,
    };

    it('should return true for MODERATOR', () => {
      expect(canManageThread(baseThread, 'user-2', Role.MODERATOR)).to.be.true;
    });

    it('should return true for ADMIN', () => {
      expect(canManageThread(baseThread, 'user-2', Role.ADMIN)).to.be.true;
    });

    it('should return true if user is the creator', () => {
      expect(canManageThread(baseThread, 'user-1', Role.USER)).to.be.true;
    });

    it('should return false for regular user who is not creator', () => {
      expect(canManageThread(baseThread, 'user-2', Role.USER)).to.be.false;
    });
  });

  describe('requireReadOrThrow', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PRIVATE',
      });
    });

    it('should not throw if user has access', async () => {
      await requireReadOrThrow(threadId, 'user-1', Role.USER);
    });

    it('should throw AppError if user has no access', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      try {
        await requireReadOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('FORBIDDEN');
        expect((error as AppError).statusCode).to.equal(403);
      }
    });

    it('should throw AppError if thread not found', async () => {
      mockPrismaThreadFindUnique(null);

      try {
        await requireReadOrThrow('non-existent', 'user-1', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('NOT_FOUND');
        expect((error as AppError).statusCode).to.equal(404);
      }
    });
  });

  describe('requireWriteOrThrow', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PRIVATE',
      });
      mockPrismaUserBanFindFirst(null);
    });

    it('should not throw if user can write', async () => {
      await requireWriteOrThrow(threadId, 'user-1', Role.USER);
    });

    it('should throw AppError if user cannot write', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      try {
        await requireWriteOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('FORBIDDEN');
        expect((error as AppError).statusCode).to.equal(403);
      }
    });

    it('should not throw for MODERATOR on any thread', async () => {
      await requireWriteOrThrow(threadId, 'mod-1', Role.MODERATOR);
    });
  });

  describe('fake store policy (no DB)', () => {
    const policy = createThreadAccessPolicy(
      createFakeThreadAccessStore({
        threads: [
          { threadId: 't-public', createdBy: 'user-1', visibility: 'PUBLIC' as ThreadVisibility },
          { threadId: 't-private', createdBy: 'user-1', visibility: 'PRIVATE' as ThreadVisibility },
        ],
        invitations: [{ threadId: 't-private', userId: 'user-2' }],
        users: [
          { id: 'user-1', email: 'one@example.com', role: Role.USER },
          { id: 'user-2', email: 'two@example.com', role: Role.USER },
          { id: 'mod-1', email: 'mod@example.com', role: Role.MODERATOR },
        ],
      })
    );

    it('public readable, private restricted without invitation', async () => {
      expect(await policy.canRead({ threadId: 't-public', createdBy: 'user-1', visibility: 'PUBLIC' as ThreadVisibility }, null)).to.equal(true);
      expect(await policy.canRead({ threadId: 't-private', createdBy: 'user-1', visibility: 'PRIVATE' as ThreadVisibility }, 'stranger')).to.equal(false);
    });

    it('creator, invitee, and moderator pass; invitation by email works', async () => {
      const priv = { threadId: 't-private', createdBy: 'user-1', visibility: 'PRIVATE' as ThreadVisibility };
      expect(await policy.canRead(priv, 'user-1', Role.USER)).to.equal(true);
      expect(await policy.canRead(priv, 'user-2', Role.USER)).to.equal(true);
      expect(await policy.canRead(priv, 'mod-1', Role.MODERATOR)).to.equal(true);
    });

    it('requireRead resolves context; missing thread is NOT_FOUND', async () => {
      const ctx = await policy.requireRead('t-private', 'user-2', Role.USER);
      expect(ctx.threadId).to.equal('t-private');
      try {
        await policy.requireRead('missing', 'user-2', Role.USER);
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('NOT_FOUND');
      }
    });

    it('visibilityFilter mirrors canRead over the fake store', async () => {
      const filter = await policy.visibilityFilter('user-2', Role.USER);
      const serialized = JSON.stringify(filter);
      expect(serialized).to.contain('PUBLIC');
      expect(serialized).to.contain('user-2');
      const modFilter = await policy.visibilityFilter('mod-1', Role.MODERATOR);
      expect(modFilter).to.deep.equal({});
    });
  });

  describe('requireReadOrThrow / requireWriteOrThrow context returns', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PRIVATE',
      });
      mockPrismaUserBanFindFirst(null);
    });

    it('requireReadOrThrow resolves the thread ONCE and returns its context', async () => {
      const ctx = await requireReadOrThrow(threadId, 'user-1', Role.USER);
      expect(ctx).to.deep.equal({ threadId, createdBy: 'user-1', visibility: 'PRIVATE' });
    });

    it('requireWriteOrThrow resolves the thread ONCE and returns its context', async () => {
      const ctx = await requireWriteOrThrow(threadId, 'user-1', Role.USER);
      expect(ctx).to.deep.equal({ threadId, createdBy: 'user-1', visibility: 'PRIVATE' });
    });

    it('requireReadOrThrow throws NOT_FOUND before FORBIDDEN when the thread is missing', async () => {
      mockPrismaThreadFindUnique(null);
      try {
        await requireReadOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('NOT_FOUND');
        expect((error as AppError).statusCode).to.equal(404);
      }
    });
  });

  describe('requireManageOrThrow', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PRIVATE',
      });
    });

    it('should return the context for the thread creator', async () => {
      const ctx = await requireManageOrThrow(threadId, 'user-1', Role.USER);
      expect(ctx).to.deep.equal({ threadId, createdBy: 'user-1', visibility: 'PRIVATE' });
    });

    it('should return the context for MODERATOR', async () => {
      const ctx = await requireManageOrThrow(threadId, 'mod-1', Role.MODERATOR);
      expect(ctx).to.deep.equal({ threadId, createdBy: 'user-1', visibility: 'PRIVATE' });
    });

    it('should return the context for ADMIN', async () => {
      const ctx = await requireManageOrThrow(threadId, 'admin-1', Role.ADMIN);
      expect(ctx).to.deep.equal({ threadId, createdBy: 'user-1', visibility: 'PRIVATE' });
    });

    it('should throw FORBIDDEN for a stranger with no access', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });
      try {
        await requireManageOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('FORBIDDEN');
        expect((error as AppError).statusCode).to.equal(403);
      }
    });

    it('should throw FORBIDDEN for an invitee who is not the creator', async () => {
      // Manage is creator-or-mod only: even a valid invitation is not enough.
      mockPrismaThreadInvitationFindFirst({ id: 'inv-1' });
      try {
        await requireManageOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('FORBIDDEN');
        expect((error as AppError).statusCode).to.equal(403);
      }
    });

    it('should throw NOT_FOUND when the thread is missing', async () => {
      mockPrismaThreadFindUnique(null);
      try {
        await requireManageOrThrow(threadId, 'user-1', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('NOT_FOUND');
        expect((error as AppError).statusCode).to.equal(404);
      }
    });
  });

  describe('visibilityFilter ≡ canReadThread parity', () => {
    // Interprets the returned where-clause against a concrete thread.
    // `hasInvitation` stands in for the accepted-invitation row both the
    // boolean check (mocked findFirst) and the filter clause rely on.
    function filterAllows(
      filter: Record<string, unknown>,
      thread: ThreadAccessContext,
      userId: string | null | undefined,
      hasInvitation: boolean
    ): boolean {
      if (Object.keys(filter).length === 0) return true;
      if ((filter as { visibility?: string }).visibility === 'PUBLIC') {
        return thread.visibility === 'PUBLIC';
      }
      const orClauses = (filter as { OR?: Array<Record<string, unknown>> }).OR;
      if (!Array.isArray(orClauses)) return false;
      for (const clause of orClauses) {
        if ((clause as { visibility?: string }).visibility === 'PUBLIC' && thread.visibility === 'PUBLIC') {
          return true;
        }
        if (
          (clause as { createdBy?: string }).createdBy !== undefined &&
          (clause as { createdBy?: string }).createdBy === userId &&
          thread.createdBy === userId
        ) {
          return true;
        }
        if ((clause as { invitations?: unknown }).invitations !== undefined && hasInvitation) {
          return true;
        }
      }
      return false;
    }

    const matrix: Array<{
      name: string;
      visibility: ThreadVisibility;
      userId: string | null;
      role: Role | null;
      hasInvitation: boolean;
      expected: boolean;
    }> = [
      { name: 'creator', visibility: 'PUBLIC', userId: 'user-1', role: Role.USER, hasInvitation: false, expected: true },
      { name: 'stranger', visibility: 'PUBLIC', userId: 'user-2', role: Role.USER, hasInvitation: false, expected: true },
      { name: 'invitee', visibility: 'PUBLIC', userId: 'user-2', role: Role.USER, hasInvitation: true, expected: true },
      { name: 'mod', visibility: 'PUBLIC', userId: 'mod-1', role: Role.MODERATOR, hasInvitation: false, expected: true },
      { name: 'admin', visibility: 'PUBLIC', userId: 'admin-1', role: Role.ADMIN, hasInvitation: false, expected: true },
      { name: 'anon', visibility: 'PUBLIC', userId: null, role: null, hasInvitation: false, expected: true },
      { name: 'creator', visibility: 'PRIVATE', userId: 'user-1', role: Role.USER, hasInvitation: false, expected: true },
      { name: 'stranger', visibility: 'PRIVATE', userId: 'user-2', role: Role.USER, hasInvitation: false, expected: false },
      { name: 'invitee', visibility: 'PRIVATE', userId: 'user-2', role: Role.USER, hasInvitation: true, expected: true },
      { name: 'mod', visibility: 'PRIVATE', userId: 'mod-1', role: Role.MODERATOR, hasInvitation: false, expected: true },
      { name: 'admin', visibility: 'PRIVATE', userId: 'admin-1', role: Role.ADMIN, hasInvitation: false, expected: true },
      { name: 'anon', visibility: 'PRIVATE', userId: null, role: null, hasInvitation: false, expected: false },
    ];

    for (const row of matrix) {
      it(`${row.name} on ${row.visibility}: filter allows ≡ canRead (${row.expected})`, async () => {
        const thread: ThreadAccessContext = {
          threadId: 'thread-1',
          createdBy: 'user-1',
          visibility: row.visibility,
        };

        mockPrismaThreadInvitationFindFirst(row.hasInvitation ? { id: 'inv-1' } : null);
        mockPrismaUserFindUnique({ email: 'user@example.com' });
        const readable = await canReadThread(thread, row.userId, row.role);
        expect(readable).to.equal(row.expected);

        mockPrismaUserFindUnique({ email: 'user@example.com' });
        const filter = await visibilityFilter(row.userId ?? undefined, row.role);
        expect(filterAllows(filter as Record<string, unknown>, thread, row.userId, row.hasInvitation)).to.equal(
          readable
        );
      });
    }
  });

  describe('client view predicates', () => {
    it('canManageView: creator or MODERATOR/ADMIN only', () => {
      expect(canManageView({ createdBy: 'u1', userId: 'u1', userRole: 'USER' })).to.be.true;
      expect(canManageView({ createdBy: 'u1', userId: 'u2', userRole: 'MODERATOR' })).to.be.true;
      expect(canManageView({ createdBy: 'u1', userId: 'u2', userRole: 'ADMIN' })).to.be.true;
      expect(canManageView({ createdBy: 'u1', userId: 'u2', userRole: 'USER' })).to.be.false;
      expect(canManageView({ createdBy: null, userId: 'u2', userRole: 'USER' })).to.be.false;
      expect(canManageView({ createdBy: null, userId: 'u2', userRole: 'ADMIN' })).to.be.true;
    });

    it('canEditMessageView: author while not deleted', () => {
      expect(canEditMessageView({ senderId: 'u1', userId: 'u1', deletedAt: null })).to.be.true;
      expect(canEditMessageView({ senderId: 'u1', userId: 'u1', deletedAt: undefined })).to.be.true;
      expect(canEditMessageView({ senderId: 'u1', userId: 'u2', deletedAt: null })).to.be.false;
      expect(canEditMessageView({ senderId: 'u1', userId: 'u1', deletedAt: new Date() })).to.be.false;
    });

    it('canDeleteMessageView: author, creator, or mod/admin while not deleted', () => {
      expect(canDeleteMessageView({ createdBy: null, senderId: 'u1', userId: 'u1', userRole: 'USER', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ createdBy: null, senderId: 'u1', userId: 'u2', userRole: 'MODERATOR', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ createdBy: null, senderId: 'u1', userId: 'u2', userRole: 'ADMIN', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ createdBy: 'u2', senderId: 'u1', userId: 'u2', userRole: 'USER', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ createdBy: null, senderId: 'u1', userId: 'u2', userRole: 'USER', deletedAt: null })).to.be.false;
      expect(canDeleteMessageView({ createdBy: null, senderId: 'u1', userId: 'u1', userRole: 'USER', deletedAt: new Date() })).to.be.false;
      expect(canDeleteMessageView({ createdBy: null, senderId: 'u1', userId: 'u2', userRole: 'MODERATOR', deletedAt: new Date() })).to.be
        .false;
    });

    it('canPinMessageView: creator or mod/admin while not deleted', () => {
      expect(canPinMessageView({ createdBy: 'u1', userId: 'u1', userRole: 'USER', deletedAt: null })).to.be.true;
      expect(canPinMessageView({ createdBy: 'u1', userId: 'u2', userRole: 'MODERATOR', deletedAt: null })).to.be.true;
      expect(canPinMessageView({ createdBy: 'u1', userId: 'u2', userRole: 'ADMIN', deletedAt: null })).to.be.true;
      expect(canPinMessageView({ createdBy: 'u1', userId: 'u2', userRole: 'USER', deletedAt: null })).to.be.false;
      expect(canPinMessageView({ createdBy: 'u1', userId: 'u1', userRole: 'USER', deletedAt: new Date() })).to.be.false;
      expect(canPinMessageView({ createdBy: null, userId: 'u2', userRole: 'USER', deletedAt: null })).to.be.false;
    });
  });
});
