import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { NotificationType, Role } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { dispatch } from '@/modules/notifications/dispatcher';

describe('notifications/dispatcher: dispatch()', () => {
  let findManyStub: sinon.SinonStub;
  let createManyStub: sinon.SinonStub;
  let errorStub: sinon.SinonStub;
  let origCreateMany: typeof prisma.notification.createMany;
  let origFindMany: typeof prisma.user.findMany;

  beforeEach(() => {
    origCreateMany = prisma.notification.createMany;
    origFindMany = prisma.user.findMany;
    // Prisma 7 delegates are Proxies — sinon.stub doesn't reliably replace them, direct assignment does
    createManyStub = sinon.stub().resolves({ count: 0 }) as unknown as sinon.SinonStub;
    findManyStub = sinon.stub().resolves([]) as unknown as sinon.SinonStub;
    (prisma.notification as unknown as Record<string, unknown>).createMany = createManyStub as unknown as typeof prisma.notification.createMany;
    (prisma.user as unknown as Record<string, unknown>).findMany = findManyStub as unknown as typeof prisma.user.findMany;
    errorStub = sinon.stub(logger, 'error');
  });

  afterEach(() => {
    (prisma.notification as unknown as Record<string, unknown>).createMany = origCreateMany as unknown as typeof prisma.notification.createMany;
    (prisma.user as unknown as Record<string, unknown>).findMany = origFindMany as unknown as typeof prisma.user.findMany;
    errorStub.restore();
  });

  describe('recipients.userIds', () => {
    it('creates one row per userId with the given category and payload', async () => {
      await dispatch({
        recipients: { userIds: ['u1', 'u2'] },
        category: NotificationType.SYSTEM,
        title: 'Hello',
        message: 'World',
        data: { foo: 'bar' },
      });

      expect(createManyStub.calledOnce).to.be.true;
      const call = createManyStub.firstCall.args[0];
      expect(call.data).to.deep.equal([
        {
          userId: 'u1',
          type: NotificationType.SYSTEM,
          title: 'Hello',
          message: 'World',
          data: { foo: 'bar' },
        },
        {
          userId: 'u2',
          type: NotificationType.SYSTEM,
          title: 'Hello',
          message: 'World',
          data: { foo: 'bar' },
        },
      ]);
      expect(findManyStub.called).to.be.false;
    });

    it('passes null data when none is supplied', async () => {
      await dispatch({
        recipients: { userIds: ['u1'] },
        category: NotificationType.INVITATION,
        title: 'Thread invitation',
      });

      const call = createManyStub.firstCall.args[0];
      expect(call.data[0]).to.include({
        userId: 'u1',
        type: NotificationType.INVITATION,
        title: 'Thread invitation',
        message: undefined,
        data: null,
      });
    });

    it('is a no-op when userIds is empty', async () => {
      await dispatch({
        recipients: { userIds: [] },
        category: NotificationType.SYSTEM,
        title: 'X',
      });
      expect(createManyStub.called).to.be.false;
    });
  });

  describe('recipients.roles', () => {
    it('looks up active non-deleted users in the given roles and fans out', async () => {
      findManyStub.resolves([{ id: 'mod-1' }, { id: 'admin-1' }]);

      await dispatch({
        recipients: { roles: [Role.MODERATOR, Role.ADMIN] },
        category: NotificationType.SYSTEM,
        title: 'Escalation',
        message: '3 reports pending > 24h',
        data: { reportIds: ['r1', 'r2'] },
      });

      expect(findManyStub.calledOnce).to.be.true;
      const whereArg = findManyStub.firstCall.args[0].where;
      expect(whereArg.role.in).to.deep.equal([Role.MODERATOR, Role.ADMIN]);
      expect(whereArg.status).to.equal('ACTIVE');
      expect(whereArg.deletedAt).to.equal(null);

      expect(createManyStub.calledOnce).to.be.true;
      const rows = createManyStub.firstCall.args[0].data;
      expect(rows).to.have.lengthOf(2);
      expect(rows[0]).to.include({ userId: 'mod-1', type: NotificationType.SYSTEM });
      expect(rows[1]).to.include({ userId: 'admin-1' });
    });

    it('is a no-op when no active users match the roles', async () => {
      findManyStub.resolves([]);
      await dispatch({
        recipients: { roles: [Role.ADMIN] },
        category: NotificationType.SYSTEM,
        title: 'X',
      });
      expect(createManyStub.called).to.be.false;
    });
  });

  describe('recipients.emails', () => {
    it('looks up users by email and fans out to matching ids', async () => {
      findManyStub.resolves([{ id: 'u-lookup-1' }, { id: 'u-lookup-2' }]);

      await dispatch({
        recipients: { emails: ['a@example.com', 'b@example.com'] },
        category: NotificationType.SYSTEM,
        title: 'X',
      });

      expect(findManyStub.calledOnce).to.be.true;
      const whereArg = findManyStub.firstCall.args[0].where;
      expect(whereArg.email.in).to.deep.equal(['a@example.com', 'b@example.com']);

      expect(createManyStub.calledOnce).to.be.true;
      const rows = createManyStub.firstCall.args[0].data;
      expect(rows.map((r: { userId: string }) => r.userId)).to.deep.equal(['u-lookup-1', 'u-lookup-2']);
    });

    it('is a no-op when emails is empty', async () => {
      await dispatch({
        recipients: { emails: [] },
        category: NotificationType.SYSTEM,
        title: 'X',
      });
      expect(findManyStub.called).to.be.false;
      expect(createManyStub.called).to.be.false;
    });
  });

  describe('best-effort contract', () => {
    it('logs and swallows errors from createMany', async () => {
      createManyStub.rejects(new Error('db down'));

      await dispatch({
        recipients: { userIds: ['u1'] },
        category: NotificationType.SYSTEM,
        title: 'X',
      });

      expect(errorStub.calledOnce).to.be.true;
      expect(errorStub.firstCall.args[0]).to.match(/notifications\.dispatcher/);
    });

    it('logs and swallows errors from the user lookup', async () => {
      findManyStub.rejects(new Error('db down'));

      await dispatch({
        recipients: { roles: [Role.ADMIN] },
        category: NotificationType.SYSTEM,
        title: 'X',
      });

      expect(createManyStub.called).to.be.false;
      expect(errorStub.calledOnce).to.be.true;
    });
  });
});
