import { expect } from 'chai';
import { getRedisConnection, closeRedisConnection } from '@/lib/queue/connection';
import { getThreadChannel, getUserChannel } from '@/lib/infrastructure/redis-pubsub';
import {
  INSTANCE_ID,
  shouldSkipLoopback,
  unregisterSocketFromMaps,
  getWsStats,
} from '@/lib/infrastructure/websocket/server';

async function redisAvailable(): Promise<boolean> {
  try {
    const conn = getRedisConnection();
    await conn.ping();
    return true;
  } catch {
    return false;
  }
}

describe('WebSocket — Redis Integration', function () {
  this.timeout(15000);

  let hasRedis = false;

  before(async function () {
    hasRedis = await redisAvailable();
    if (!hasRedis) {
      console.log('[WS Redis Integration] Redis unavailable — skipping');
      this.skip();
    }
  });

  describe('Redis pub/sub channel helpers', function () {
    it('getThreadChannel returns correct format', function () {
      const channel = getThreadChannel('thread-123');
      expect(channel).to.equal('thread:thread-123');
    });

    it('getUserChannel returns correct format', function () {
      const channel = getUserChannel('user-456');
      expect(channel).to.equal('user:user-456');
    });
  });

  describe('Typing indicators via Redis', function () {
    const testThreadId = `typing-test-${Date.now()}`;
    const testKey = `typing:${testThreadId}`;

    after(async function () {
      if (!hasRedis) return;
      const conn = getRedisConnection();
      await conn.del(testKey);
    });

    it('can store and retrieve typing indicators via Redis hash', async function () {
      const conn = getRedisConnection();

      // Set typing indicator for two users
      const data1 = JSON.stringify({ userId: 'user1', userName: 'Alice', threadId: testThreadId, timestamp: Date.now() });
      const data2 = JSON.stringify({ userId: 'user2', userName: 'Bob', threadId: testThreadId, timestamp: Date.now() });

      await conn.hset(testKey, 'user1', data1);
      await conn.hset(testKey, 'user2', data2);
      await conn.expire(testKey, 5);

      // Retrieve all
      const all = await conn.hgetall(testKey);
      expect(Object.keys(all)).to.have.lengthOf(2);

      const parsed1 = JSON.parse(all['user1']);
      expect(parsed1.userId).to.equal('user1');
      expect(parsed1.userName).to.equal('Alice');

      const parsed2 = JSON.parse(all['user2']);
      expect(parsed2.userId).to.equal('user2');
      expect(parsed2.userName).to.equal('Bob');
    });

    it('can remove a typing indicator via Redis hdel', async function () {
      const conn = getRedisConnection();

      // Remove user1
      await conn.hdel(testKey, 'user1');

      const all = await conn.hgetall(testKey);
      expect(Object.keys(all)).to.have.lengthOf(1);
      expect(all['user1']).to.be.undefined;
      expect(all['user2']).to.exist;
    });

    it('returns empty hash for non-existent key', async function () {
      const conn = getRedisConnection();
      const all = await conn.hgetall('typing:nonexistent-thread');
      expect(all).to.deep.equal({});
    });

    it('typing indicator key has TTL set', async function () {
      const conn = getRedisConnection();
      const ttl = await conn.ttl(testKey);
      // TTL should be between 0 and 5 seconds
      expect(ttl).to.be.greaterThan(0);
      expect(ttl).to.be.at.most(5);
    });
  });

  describe('Redis publish/subscribe for thread events', function () {
    it('can publish to thread channel', async function () {
      const conn = getRedisConnection();
      const channel = getThreadChannel('test-thread-pub');

      // Publish a test message
      await conn.publish(channel, JSON.stringify({ type: 'TEST', threadId: 'test-thread-pub' }));

      // Verify the channel exists (publish succeeds even without subscribers)
      // This test mainly verifies publish doesn't throw
    });

    it('can publish to user channel', async function () {
      const conn = getRedisConnection();
      const channel = getUserChannel('test-user-pub');

      await conn.publish(channel, JSON.stringify({ type: 'TEST', userId: 'test-user-pub' }));
    });
  });

  describe('getWsStats', function () {
    it('returns correct stats shape', function () {
      const stats = getWsStats();
      expect(stats).to.have.property('totalConnections');
      expect(stats).to.have.property('connectedUsers');
      expect(stats).to.have.property('activeThreadRooms');
      expect(stats).to.have.property('activeTypingUsers');
      expect(stats.totalConnections).to.be.a('number');
      expect(stats.connectedUsers).to.be.a('number');
      expect(stats.activeThreadRooms).to.be.a('number');
      expect(stats.activeTypingUsers).to.equal(0);
    });
  });

  describe('INSTANCE_ID', function () {
    it('is a valid UUID', function () {
      expect(INSTANCE_ID).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('is unique per import', async function () {
      // Re-importing should get the same singleton value
      const mod = await import('@/lib/infrastructure/websocket/server');
      expect(mod.INSTANCE_ID).to.equal(INSTANCE_ID);
    });
  });

  describe('shouldSkipLoopback', function () {
    it('skips same-instance messages', function () {
      const event = JSON.stringify({ sourceInstance: INSTANCE_ID });
      expect(shouldSkipLoopback(event, INSTANCE_ID)).to.be.true;
    });

    it('forwards cross-instance messages', function () {
      const event = JSON.stringify({ sourceInstance: 'other-instance-id' });
      expect(shouldSkipLoopback(event, INSTANCE_ID)).to.be.false;
    });

    it('forwards messages without sourceInstance', function () {
      const event = JSON.stringify({ type: 'TEST' });
      expect(shouldSkipLoopback(event, INSTANCE_ID)).to.be.false;
    });

    it('returns false for malformed JSON', function () {
      expect(shouldSkipLoopback('not-json', INSTANCE_ID)).to.be.false;
    });
  });

  describe('unregisterSocketFromMaps', function () {
    it('removes socket from thread channel', function () {
      const threadChannels = new Map<string, Set<any>>();
      const connectionsByUserId = new Map<string, Set<any>>();
      const socket = { userId: 'u1', threadId: 't1' };

      threadChannels.set('t1', new Set([socket]));
      connectionsByUserId.set('u1', new Set([socket]));

      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId);

      expect(threadChannels.has('t1')).to.be.false;
      expect(connectionsByUserId.has('u1')).to.be.false;
    });

    it('handles socket without threadId', function () {
      const threadChannels = new Map<string, Set<any>>();
      const connectionsByUserId = new Map<string, Set<any>>();
      const socket = { userId: 'u1' };

      connectionsByUserId.set('u1', new Set([socket]));
      unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId);

      expect(threadChannels.size).to.equal(0);
      expect(connectionsByUserId.has('u1')).to.be.false;
    });

    it('preserves other sockets in same thread', function () {
      const threadChannels = new Map<string, Set<any>>();
      const connectionsByUserId = new Map<string, Set<any>>();
      const socket1 = { userId: 'u1', threadId: 't1' };
      const socket2 = { userId: 'u2', threadId: 't1' };

      threadChannels.set('t1', new Set([socket1, socket2]));
      connectionsByUserId.set('u1', new Set([socket1]));
      connectionsByUserId.set('u2', new Set([socket2]));

      unregisterSocketFromMaps(socket1, threadChannels, connectionsByUserId);

      expect(threadChannels.has('t1')).to.be.true;
      expect(threadChannels.get('t1')!.size).to.equal(1);
      expect(threadChannels.get('t1')!.has(socket2)).to.be.true;
    });
  });

  after(async function () {
    if (hasRedis) {
      await closeRedisConnection();
    }
  });
});
