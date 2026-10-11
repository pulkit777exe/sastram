import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { Role, ThreadVisibility } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  canAccessThread,
  canReadThread,
  visibilityFilter,
  canWriteToThread,
  canWriteThread,
  canManageThread,
  requireThreadAccessOrThrow,
  requireThreadWriteOrThrow,
  requireReadOrThrow,
  requireWriteOrThrow,
  requireManageOrThrow,
  type ThreadAccessContext,
} from '../lib/thread-access';
import {
  canManageView,
  canEditMessageView,
  canDeleteMessageView,
  canPinMessageView,
} from '../lib/thread-access/client';
import { AppError } from '../lib/utils/errors';

// Prisma proxy methods can't be safely stubbed with sinon — save originals.
const origThreadInvitationFindFirst = (prisma.threadInvitation as unknown as Record<string, unknown>).findFirst as unknown;
const origUserFindUnique = (prisma.user as unknown as Record<string, unknown>).findUnique as unknown;
const origThreadFindUnique = (prisma.thread as unknown as Record<string, unknown>).findUnique as unknown;

function mockPrismaThreadInvitationFindFirst(result: unknown) {
  (prisma.threadInvitation as unknown as Record<string, unknown>).findFirst = async () => result as unknown;
}

function mockPrismaUserFindUnique(result: unknown) {
  (prisma.user as unknown as Record<string, unknown>).findUnique = async () => result as unknown;
}

function mockPrismaThreadFindUnique(result: unknown) {
  (prisma.thread as unknown as Record<string, unknown>).findUnique = async () => result as unknown;
}

function restorePrismaMocks() {
  (prisma.threadInvitation as unknown as Record<string, unknown>).findFirst = origThreadInvitationFindFirst as unknown;
  (prisma.user as unknown as Record<string, unknown>).findUnique = origUserFindUnique as unknown;
  (prisma.thread as unknown as Record<string, unknown>).findUnique = origThreadFindUnique as unknown;
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

    it('should return true if user has accepted invitation by senderId', async () => {
      mockPrismaThreadInvitationFindFirst({ id: 'inv-1' });
      expect(await canAccessThread(baseThread, 'user-2', Role.USER)).to.be.true;
    });

    it('should return true if user has accepted invitation by email', async () => {
      let callCount = 0;
      (prisma.threadInvitation as unknown as Record<string, unknown>).findFirst = async () => {
        callCount++;
        if (callCount === 1) return null; // senderId lookup
        return { id: 'inv-2' }; // email lookup
      };
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
      expect((invitationFilter as unknown as { invitations: { some: { OR: unknown[] } } }).invitations.some.OR).to.deep.include({ senderId: 'user-1' });
    });
  });

  describe('canWriteToThread', () => {
    const baseThread: ThreadAccessContext = {
      threadId: 'thread-1',
      createdBy: 'user-1',
      visibility: 'PRIVATE' as ThreadVisibility,
    };

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
      expect(await canWriteToThread(baseThread, 'user-2', Role.USER)).to.be.true;
    });

    it('should return false if canAccessThread returns false', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });
      expect(await canWriteToThread(baseThread, 'user-2', Role.USER)).to.be.false;
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

  describe('requireThreadAccessOrThrow', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PRIVATE',
      });
    });

    it('should not throw if user has access', async () => {
      await requireThreadAccessOrThrow(threadId, 'user-1', Role.USER);
    });

    it('should throw AppError if user has no access', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      try {
        await requireThreadAccessOrThrow(threadId, 'user-2', Role.USER);
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
        await requireThreadAccessOrThrow('non-existent', 'user-1', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('NOT_FOUND');
        expect((error as AppError).statusCode).to.equal(404);
      }
    });
  });

  describe('requireThreadWriteOrThrow', () => {
    const threadId = 'thread-1';

    beforeEach(() => {
      mockPrismaThreadFindUnique({
        id: threadId,
        createdBy: 'user-1',
        visibility: 'PRIVATE',
      });
    });

    it('should not throw if user can write', async () => {
      await requireThreadWriteOrThrow(threadId, 'user-1', Role.USER);
    });

    it('should throw AppError if user cannot write', async () => {
      mockPrismaThreadInvitationFindFirst(null);
      mockPrismaUserFindUnique({ email: 'user@example.com' });

      try {
        await requireThreadWriteOrThrow(threadId, 'user-2', Role.USER);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('FORBIDDEN');
        expect((error as AppError).statusCode).to.equal(403);
      }
    });

    it('should not throw for MODERATOR on any thread', async () => {
      await requireThreadWriteOrThrow(threadId, 'mod-1', Role.MODERATOR);
    });
  });

  describe('canonical aliases', () => {
    it('canReadThread is canAccessThread', () => {
      expect(canReadThread).to.equal(canAccessThread);
    });

    it('canWriteThread is canWriteToThread', () => {
      expect(canWriteThread).to.equal(canWriteToThread);
    });

    it('requireThreadAccessOrThrow is requireReadOrThrow', () => {
      expect(requireThreadAccessOrThrow).to.equal(requireReadOrThrow);
    });

    it('requireThreadWriteOrThrow is requireWriteOrThrow', () => {
      expect(requireThreadWriteOrThrow).to.equal(requireWriteOrThrow);
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

        if (row.hasInvitation) {
          mockPrismaThreadInvitationFindFirst({ id: 'inv-1' });
        } else {
          mockPrismaThreadInvitationFindFirst(null);
          mockPrismaUserFindUnique({ email: 'user@example.com' });
        }
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

    it('canDeleteMessageView: author or mod/admin while not deleted', () => {
      expect(canDeleteMessageView({ senderId: 'u1', userId: 'u1', userRole: 'USER', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ senderId: 'u1', userId: 'u2', userRole: 'MODERATOR', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ senderId: 'u1', userId: 'u2', userRole: 'ADMIN', deletedAt: null })).to.be.true;
      expect(canDeleteMessageView({ senderId: 'u1', userId: 'u2', userRole: 'USER', deletedAt: null })).to.be.false;
      expect(canDeleteMessageView({ senderId: 'u1', userId: 'u1', userRole: 'USER', deletedAt: new Date() })).to.be.false;
      expect(canDeleteMessageView({ senderId: 'u1', userId: 'u2', userRole: 'MODERATOR', deletedAt: new Date() })).to.be
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
