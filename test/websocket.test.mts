import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  INSTANCE_ID,
  shouldSkipLoopback,
  unregisterSocketFromMaps,
} from '@/lib/infrastructure/websocket/server';

function createMaps() {
  const threadChannels = new Map<string, Set<unknown>>();
  const connectionsByUserId = new Map<string, Set<unknown>>();
  const typingIndicators = new Map<string, Map<string, { userId: string }>>();
  return { threadChannels, connectionsByUserId, typingIndicators };
}

function registerSocket(
  threadId: string,
  socket: { userId?: string; threadId?: string },
  threadChannels: Map<string, Set<unknown>>,
  connectionsByUserId: Map<string, Set<unknown>>,
) {
  const channel = threadChannels.get(threadId) ?? new Set();
  channel.add(socket);
  threadChannels.set(threadId, channel);

  if (socket.userId) {
    const userConns = connectionsByUserId.get(socket.userId) ?? new Set();
    userConns.add(socket);
    connectionsByUserId.set(socket.userId, userConns);
  }
}

describe('WebSocket — Cross-Instance Delivery', () => {
  describe('unregisterSocketFromMaps', () => {
    it('should remove socket from threadChannels', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1' };

      registerSocket('t1', socket, threadChannels, connectionsByUserId);
      expect(threadChannels.get('t1')?.size).to.equal(1);

      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(threadChannels.has('t1')).to.be.false;
    });

    it('should delete threadChannels entry when last socket', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1' };

      registerSocket('t1', socket, threadChannels, connectionsByUserId);
      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId, typingIndicators);

      expect(threadChannels.has('t1')).to.be.false;
    });

    it('should remove socket from connectionsByUserId', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1' };

      registerSocket('t1', socket, threadChannels, connectionsByUserId);
      expect(connectionsByUserId.get('u1')?.size).to.equal(1);

      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(connectionsByUserId.has('u1')).to.be.false;
    });

    it('should clean up typing indicators', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1' };

      const threadTyping = new Map<string, { userId: string }>();
      threadTyping.set('u1', { userId: 'u1' });
      typingIndicators.set('t1', threadTyping);

      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(typingIndicators.has('t1')).to.be.false;
    });

    it('should handle socket without threadId (notification socket)', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1' };

      const userConns = new Set<unknown>();
      userConns.add(socket);
      connectionsByUserId.set('u1', userConns);

      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(connectionsByUserId.has('u1')).to.be.false;
    });
  });

  describe('instance ID loopback prevention', () => {
    it('should skip messages from the same instance', () => {
      const message = JSON.stringify({ type: 'NEW_MESSAGE', sourceInstance: INSTANCE_ID });
      expect(shouldSkipLoopback(message, INSTANCE_ID)).to.be.true;
    });

    it('should forward messages from other instances', () => {
      const message = JSON.stringify({ type: 'NEW_MESSAGE', sourceInstance: 'other-instance' });
      expect(shouldSkipLoopback(message, INSTANCE_ID)).to.be.false;
    });

    it('should forward messages without sourceInstance', () => {
      const message = JSON.stringify({ type: 'NEW_MESSAGE' });
      expect(shouldSkipLoopback(message, INSTANCE_ID)).to.be.false;
    });

    it('should handle malformed JSON gracefully', () => {
      expect(shouldSkipLoopback('not-json', INSTANCE_ID)).to.be.false;
    });
  });

  describe('Redis event payload', () => {
    it('should include sourceInstance in thread events', () => {
      const payload = { content: 'hello' };
      const event = {
        type: 'NEW_MESSAGE' as const,
        sectionId: 't1',
        payload,
        sourceInstance: INSTANCE_ID,
      };
      expect(event.sourceInstance).to.equal(INSTANCE_ID);
      expect(JSON.parse(JSON.stringify(event)).sourceInstance).to.equal(INSTANCE_ID);
    });

    it('should include sourceInstance in user events', () => {
      const event = {
        type: 'NOTIFICATION_COUNT_UPDATE' as const,
        sectionId: 'u1',
        payload: { unreadCount: 5 },
        sourceInstance: INSTANCE_ID,
      };
      expect(event.sourceInstance).to.equal(INSTANCE_ID);
      expect(JSON.parse(JSON.stringify(event)).sourceInstance).to.equal(INSTANCE_ID);
    });
  });

  describe('pub/sub channel helpers', () => {
    it('should format thread channel correctly', () => {
      const channel = (id: string) => `thread:${id}`;
      expect(channel('abc-123')).to.equal('thread:abc-123');
    });

    it('should format user channel correctly', () => {
      const channel = (id: string) => `user:${id}`;
      expect(channel('user-456')).to.equal('user:user-456');
    });
  });
});
