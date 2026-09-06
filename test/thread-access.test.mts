import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { Role, ThreadVisibility } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  canAccessThread,
  visibilityFilter,
  canWriteToThread,
  canManageThread,
  requireThreadAccessOrThrow,
  requireThreadWriteOrThrow,
  type ThreadAccessContext,
} from '../lib/thread-access';
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
});
