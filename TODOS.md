# TODOS

## WebSocket Cross-Instance Delivery Fixes

### TODO 1: Add Redis user channels for cross-instance notification delivery

- **What:** Add `user:<userId>` Redis channel. `publishUserEvent` publishes to it. WS server subscribes to `user:*` pattern. On receiving a user event, forward to local WebSocket connections for that user.
- **Why:** Notifications are silently dropped when the user is connected to a different instance — production data loss.
- **Depends on:** TODO 2 (instance ID prevents loopback on user channels too).
- **Context:** `lib/infrastructure/websocket/server.ts:368-378` — `publishUserEvent` only reads from in-memory `connectionsByUserId` Map. No Redis fallback exists. The function returns early if the user isn't connected to the local instance, silently dropping the notification. The Redis pub/sub infrastructure (`lib/infrastructure/redis-pubsub.ts`) already exists with both publisher and subscriber clients.

### TODO 2: Add instance ID + always-publish to fix publishThreadEvent

- **What:** Generate a UUID at WS server startup (`INSTANCE_ID`). Remove the `if (!channel) return` guard — always publish to Redis. Include `sourceInstance` in Redis message payload. In the subscriber handler, skip forwarding if `sourceInstance === localInstanceId`.
- **Why:** Two bugs: (1) Early return at `server.ts:382` prevents Redis publish when no local subscribers exist, breaking cross-instance delivery. (2) Missing instance ID causes double-delivery — the Redis subscriber on the originating instance receives its own messages and re-delivers to local clients.
- **Depends on:** Nothing.
- **Context:** `lib/infrastructure/websocket/server.ts:380-403` — `publishThreadEvent` broadcasts locally then publishes to Redis. The subscriber at lines 348-358 forwards all Redis messages to local clients without checking origin. With the fix, every publish goes through Redis and the instance ID check prevents loopback. Adds ~1-5ms latency per event in single-instance mode.

### TODO 3: Extract `unregisterSocket` function

- **What:** Create `unregisterSocket(ws: AuthenticatedWebSocket)` that handles removal from `threadChannels`, `connectionsByUserId`, and `typingIndicators`. Call from a single `ws.on('close')` handler in `wss.on('connection')`.
- **Why:** Cleanup is currently duplicated — `registerSocket` at `server.ts:83-108` registers its own close handler, and the notification connection handler at `server.ts:196-206` duplicates the `connectionsByUserId` cleanup. DRY violation.
- **Depends on:** Nothing.
- **Context:** Two separate close-handler implementations. Adding a third socket type would require remembering to add cleanup again. Extract once, reuse everywhere.

### TODO 4: Expand `RedisThreadEvent` union + remove `as never` casts

- **What:** Add `REACTION_UPDATE`, `USER_TYPING`, `USER_STOPPED_TYPING`, `MENTION_NOTIFICATION` to the `RedisThreadEvent` discriminated union in `redis-pubsub.ts`. Remove all `as never` casts in `modules/ws/publisher.ts`.
- **Why:** The type system currently lies about what events flow through Redis. `RedisThreadEvent` only declares 4 types, but 7 types are actually published via `as never` casts. A refactor of event shapes won't produce compiler errors.
- **Depends on:** Nothing.
- **Context:** `lib/infrastructure/redis-pubsub.ts:24-28` defines the type. `modules/ws/publisher.ts:162,178-179,201` uses `as never` to bypass it.

### TODO 5: Add error logging to empty `.catch()` handlers

- **What:** Replace the empty `.catch(() => {})` at `server.ts:400-402` with structured error logging.
- **Why:** Redis publish failures are completely silent. With the always-publish-to-Redis fix (TODO 2), this path becomes the primary delivery mechanism — failures must be observable. Consistent with the pattern already used in `modules/ws/publisher.ts`.
- **Depends on:** TODO 2.
- **Context:** `lib/infrastructure/websocket/server.ts:400-402` — the dynamic import of redis-pubsub has an empty catch. Should log error, threadId, and payload info when Redis publish fails.

### TODO 6: Add unit tests for publish functions + Redis subscriber

- **What:** Mocha unit tests for `publishThreadEvent`, `publishUserEvent`, and the Redis subscriber forwarding logic. Mock Redis pub/sub. One integration test with real Redis for cross-instance flow.
- **Why:** Zero WebSocket tests exist. The cross-instance fix introduces critical delivery paths that must be tested — silent failures are unacceptable. 3 critical gaps identified in review (notification drop, event loss, double delivery).
- **Depends on:** TODOs 1, 2 (code must exist to test).
- **Context:** Follow existing Mocha + Chai pattern in `test/` directory. Use mock Redis client or real Redis instance. Test: (a) publish from one instance reaches subscribers on another, (b) instance ID prevents loopback, (c) user notification reaches correct user regardless of instance, (d) Redis failure is logged but doesn't crash.

### TODO 7: Switch from `psubscribe` to selective channel subscriptions

- **What:** Instead of `psubscribe('thread:*')` (delivers all thread events to every instance), dynamically subscribe/unsubscribe individual channels (`thread:<id>`) based on active local subscribers. Same for `user:*` → individual `user:<id>` channels.
- **Why:** Fan-out waste — every instance receives events for threads it has zero interest in. At 10,000+ active threads, this is significant unnecessary Redis traffic.
- **Depends on:** TODO 2 (subscriber infrastructure changes).
- **Context:** `lib/infrastructure/websocket/server.ts:337-358`. Requires tracking active subscription count per channel, subscribing on first local subscriber, unsubscribing when last local subscriber leaves. Adds SUBSCRIBE/UNSUBSCRIBE commands on socket connect/disconnect.
