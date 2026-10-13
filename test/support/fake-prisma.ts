/**
 * Shared prisma fakes for tests (T1).
 *
 * Prisma 7 model delegates do not honor sinon.stub — method dispatch bypasses
 * stubbed own-props (proven empirically). Direct assignment DOES intercept
 * calls. This module owns the `as unknown as Record` cast and the
 * save/assign/restore cycle so individual test files declare only rows.
 *
 * Usage:
 *   const restore = installFakePrisma({
 *     'thread.findUnique': async () => ({ ... }),
 *     'userBookmark.upsert': async (args) => { ... },
 *   });
 *   try { ... } finally { restore(); }
 */
import { prisma } from '@/lib/infrastructure/prisma';

type FakeImpl = (...args: never[]) => unknown;

function resolveModel(model: string): Record<string, unknown> {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[model];
  if (!delegate) throw new Error(`[fake-prisma] unknown model: ${model}`);
  return delegate;
}

export function installFakePrisma(overrides: Record<string, FakeImpl>): () => void {
  const saved: { target: Record<string, unknown>; key: string; orig: unknown }[] = [];
  for (const [path, impl] of Object.entries(overrides)) {
    const dot = path.indexOf('.');
    if (dot < 0) throw new Error(`[fake-prisma] override key must be "model.method", got: ${path}`);
    const target = resolveModel(path.slice(0, dot));
    const key = path.slice(dot + 1);
    saved.push({ target, key, orig: target[key] });
    target[key] = impl;
  }
  return () => {
    for (let i = saved.length - 1; i >= 0; i--) {
      const s = saved[i]!;
      s.target[s.key] = s.orig;
    }
  };
}

/** Interception counter — proves the fake ran (not a failure-path coincidence). */
export function counted<T extends FakeImpl>(fn: T, onCall?: () => void): T {
  return ((...args: never[]) => {
    onCall?.();
    return (fn as (...a: never[]) => unknown)(...args);
  }) as T;
}
