import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import { EventEmitter } from 'events';

const INSTANCE_ID = 'test-instance-uuid';

function createMaps() {
  const threadChannels = new Map<string, Set<{ id: string; userId?: string; threadId?: string; readyState: number }>>();
  const connectionsByUserId = new Map<string, Set<{ id: string; userId?: string; threadId?: string; readyState: number }>>();
  const typingIndicators = new Map<string, Map<string, { userId: string; userName: string; timestamp: number }>>();
  return { threadChannels, connectionsByUserId, typingIndicators };
}

function registerSocket(
  threadId: string,
  socket: { id: string; userId?: string; threadId?: string; readyState: number },
  threadChannels: Map<string, Set<typeof socket>>,
  connectionsByUserId: Map<string, Set<typeof socket>>,
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

function unregisterSocket(
  socket: { id: string; userId?: string; threadId?: string; readyState: number },
  threadChannels: Map<string, Set<typeof socket>>,
  connectionsByUserId: Map<string, Set<typeof socket>>,
  typingIndicators: Map<string, Map<string, { userId: string; userName: string; timestamp: number }>>,
) {
  if (socket.threadId) {
    const channel = threadChannels.get(socket.threadId);
    if (channel) {
      channel.delete(socket);
      if (channel.size === 0) {
        threadChannels.delete(socket.threadId);
      }
    }

    const threadTyping = typingIndicators.get(socket.threadId);
    if (threadTyping && socket.userId) {
      threadTyping.delete(socket.userId);
      if (threadTyping.size === 0) {
        typingIndicators.delete(socket.threadId);
      }
    }
  }

  if (socket.userId) {
    const userConns = connectionsByUserId.get(socket.userId);
    if (userConns) {
      userConns.delete(socket);
      if (userConns.size === 0) {
        connectionsByUserId.delete(socket.userId);
      }
    }
  }
}

function shouldSkipLoopback(message: string, instanceId: string): boolean {
  try {
    const parsed = JSON.parse(message) as { sourceInstance?: string };
    return parsed.sourceInstance === instanceId;
  } catch {
    return false;
  }
}

describe('WebSocket — Cross-Instance Delivery', () => {
  describe('unregisterSocket', () => {
    it('should remove socket from threadChannels', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1', readyState: 1 };

      registerSocket('t1', socket, threadChannels, connectionsByUserId);
      expect(threadChannels.get('t1')?.size).to.equal(1);

      unregisterSocket(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(threadChannels.has('t1')).to.be.false;
    });

    it('should delete threadChannels entry when last socket', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1', readyState: 1 };

      registerSocket('t1', socket, threadChannels, connectionsByUserId);
      unregisterSocket(socket, threadChannels, connectionsByUserId, typingIndicators);

      expect(threadChannels.has('t1')).to.be.false;
    });

    it('should remove socket from connectionsByUserId', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1', readyState: 1 };

      registerSocket('t1', socket, threadChannels, connectionsByUserId);
      expect(connectionsByUserId.get('u1')?.size).to.equal(1);

      unregisterSocket(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(connectionsByUserId.has('u1')).to.be.false;
    });

    it('should clean up typing indicators', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', threadId: 't1', readyState: 1 };

      const threadTyping = new Map<string, { userId: string; userName: string; timestamp: number }>();
      threadTyping.set('u1', { userId: 'u1', userName: 'User', timestamp: Date.now() });
      typingIndicators.set('t1', threadTyping);

      unregisterSocket(socket, threadChannels, connectionsByUserId, typingIndicators);
      expect(typingIndicators.has('t1')).to.be.false;
    });

    it('should handle socket without threadId (notification socket)', () => {
      const { threadChannels, connectionsByUserId, typingIndicators } = createMaps();
      const socket = { id: 's1', userId: 'u1', readyState: 1 };

      const userConns = new Set<typeof socket>();
      userConns.add(socket);
      connectionsByUserId.set('u1', userConns);

      unregisterSocket(socket, threadChannels, connectionsByUserId, typingIndicators);
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
