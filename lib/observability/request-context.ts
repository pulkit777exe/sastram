import type { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = {
  requestId?: string;
};

type AsyncHooksModule = {
  AsyncLocalStorage: new <T>() => AsyncLocalStorage<T>;
};

type ProcessWithBuiltins = NodeJS.Process & {
  getBuiltinModule?: (id: string) => unknown;
};

/**
 * Load AsyncLocalStorage at runtime instead of importing `node:async_hooks`
 * statically. Logger is reachable from modules Turbopack also bundles for the
 * browser/edge graph, where a static Node builtin import is not chunkable.
 * `process.getBuiltinModule` is available on the supported Node versions and
 * simply yields no storage in non-Node runtimes.
 */
function createStorage(): AsyncLocalStorage<RequestContext> | null {
  try {
    const hooks = (globalThis.process as ProcessWithBuiltins | undefined)?.getBuiltinModule?.(
      'node:async_hooks'
    ) as AsyncHooksModule | undefined;
    return hooks ? new hooks.AsyncLocalStorage<RequestContext>() : null;
  } catch {
    return null;
  }
}

const storage = createStorage();

/** Run a route/action inside a request-scoped correlation context. */
export function runWithRequestContext<T>(requestId: string | undefined, fn: () => T): T {
  if (!storage) return fn();
  return storage.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return storage?.getStore()?.requestId;
}
