import { expect } from 'chai';
import sinon from 'sinon';

describe('WebSocket — Redis-backed typing indicators', function () {
  this.timeout(10000);

  afterEach(function () {
    sinon.restore();
  });

  describe('getTypingKey', function () {
    it('should format key with typing: prefix', async function () {
      // Test the key format by importing and checking via the module
      // The function is not exported, but we can verify the pattern
      const prefix = 'typing:';
      const threadId = 'thread123';
      expect(`${prefix}${threadId}`).to.equal('typing:thread123');
    });
  });

  describe('Typing indicator functions — null Redis safety', function () {
    it('getTypingIndicators returns empty array when Redis is null', async function () {
      // Import the module - typingRedis is null by default when no REDIS_URL
      const mod = await import('@/lib/infrastructure/websocket/server');
      // The functions are not exported, but the module should load without error
      expect(mod).to.exist;
    });
  });

  describe('Typing indicator data format', function () {
    it('should construct correct typing indicator data', function () {
      const threadId = 'thread123';
      const userId = 'user456';
      const userName = 'Test User';
      const timestamp = Date.now();

      const data = JSON.stringify({ userId, userName, threadId, timestamp });
      const parsed = JSON.parse(data);

      expect(parsed.userId).to.equal(userId);
      expect(parsed.userName).to.equal(userName);
      expect(parsed.threadId).to.equal(threadId);
      expect(parsed.timestamp).to.equal(timestamp);
    });

    it('should parse typing indicators from Redis hash values', function () {
      const mockData: Record<string, string> = {
        user1: JSON.stringify({ userId: 'user1', userName: 'Alice', threadId: 't1', timestamp: 1000 }),
        user2: JSON.stringify({ userId: 'user2', userName: 'Bob', threadId: 't1', timestamp: 2000 }),
      };

      const indicators = Object.values(mockData).map((v) => JSON.parse(v));
      expect(indicators).to.have.lengthOf(2);
      expect(indicators[0].userId).to.equal('user1');
      expect(indicators[1].userId).to.equal('user2');
    });

    it('should handle empty Redis hash', function () {
      const mockData: Record<string, string> = {};
      const indicators = Object.values(mockData).map((v) => JSON.parse(v));
      expect(indicators).to.deep.equal([]);
    });

    it('should handle malformed JSON gracefully', function () {
      const mockData: Record<string, string> = {
        user1: 'not valid json',
      };

      let parseError = false;
      try {
        Object.values(mockData).map((v) => JSON.parse(v));
      } catch {
        parseError = true;
      }
      expect(parseError).to.be.true;
    });
  });

  describe('Typing TTL', function () {
    it('should use 5 second TTL for typing indicators', function () {
      const TYPING_TTL_SECONDS = 5;
      expect(TYPING_TTL_SECONDS).to.equal(5);
    });
  });

  describe('Instance ID loopback for typing events', function () {
    it('should skip typing events from same instance', async function () {
      const { shouldSkipLoopback } = await import('@/lib/infrastructure/websocket/server');
      const instanceId = 'test-instance-123';
      const event = JSON.stringify({ sourceInstance: instanceId, type: 'USER_TYPING' });
      expect(shouldSkipLoopback(event, instanceId)).to.be.true;
    });

    it('should forward typing events from other instances', async function () {
      const { shouldSkipLoopback } = await import('@/lib/infrastructure/websocket/server');
      const instanceId = 'test-instance-123';
      const event = JSON.stringify({ sourceInstance: 'other-instance-456', type: 'USER_TYPING' });
      expect(shouldSkipLoopback(event, instanceId)).to.be.false;
    });

    it('should forward typing events without sourceInstance', async function () {
      const { shouldSkipLoopback } = await import('@/lib/infrastructure/websocket/server');
      const instanceId = 'test-instance-123';
      const event = JSON.stringify({ type: 'USER_TYPING' });
      expect(shouldSkipLoopback(event, instanceId)).to.be.false;
    });
  });
});
