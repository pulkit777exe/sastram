import { config } from 'dotenv';
import 'global-jsdom/register';

config({ path: '.env.test' });

// Prisma 7 model delegates are Proxy-backed: methods are served as fresh
// functions on every property access, so `sinon.stub(prisma.x, 'method')` and
// plain assignment never stick. Replace each delegate with a plain object
// holding the original methods (bound, behavior-identical for real calls) so
// tests can stub/restore them normally.
function makePrismaDelegatesStubbable(prisma: Record<string, unknown>) {
  const MODEL_METHODS = [
    'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
    'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
    'count', 'aggregate', 'groupBy',
  ];

  for (const key of Object.keys(prisma)) {
    const delegate = prisma[key] as Record<string, unknown> | undefined;
    if (!delegate || typeof delegate !== 'object' || typeof delegate.findUnique !== 'function') {
      continue;
    }

    const wrapped: Record<string, unknown> = {};
    for (const method of MODEL_METHODS) {
      const fn = delegate[method];
      if (typeof fn === 'function') {
        wrapped[method] = fn.bind(delegate);
      }
    }

    Object.defineProperty(prisma, key, { value: wrapped, writable: true, configurable: true });
  }
}

try {
  const { prisma } = require('@/lib/infrastructure/prisma');
  makePrismaDelegatesStubbable(prisma);
} catch {
  // No DATABASE_URL available (e.g. running a subset of tests without env):
  // leave prisma untouched — tests that need it will fail with a clear error.
}
