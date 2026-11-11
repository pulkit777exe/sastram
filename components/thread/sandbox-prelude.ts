/**
 * Sandbox prelude for click-to-run snippets (code-runner).
 *
 * Snippets are other users' code executed in the viewer's browser after an
 * explicit Run click. `new Function('console', prelude + code)` scopes the
 * snippet inside a sandboxed iframe: every name below resolves to `undefined`
 * inside snippet scope via `const` shadowing, while the sandbox runtime keeps
 * working.
 *
 * Threat model: a snippet calling `fetch('/api/...')` could ride the viewer's
 * session if it ran same-origin; `postMessage` could forge completion output.
 *
 * Why each entry:
 * - fetch / XMLHttpRequest / WebSocket / EventSource / WebTransport /
 *   BroadcastChannel / navigator (sendBeacon): network exfiltration as the viewer.
 * - importScripts: pulls remote code into the sandbox.
 * - self / globalThis: escape hatches back to the real global (and its fetch).
 * - postMessage / onmessage / close: forging completion messages, killing runs.
 * - Function: nested constructors run in *global* scope, escaping these
 *   shadows. (Direct `eval` stays in snippet scope and only sees the shadows.)
 */
const WORKER_NEUTERED = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'BroadcastChannel',
  'navigator',
  'importScripts',
  'self',
  'globalThis',
  'postMessage',
  'onmessage',
  'close',
  'Function',
] as const;

/**
 * Extra neutering for iframe execution, which (unlike a dedicated Worker)
 * shares a DOM and storage surface even though the sandbox makes it opaque.
 * Applied on top of WORKER_NEUTERED.
 */
const MAIN_THREAD_EXTRA = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'location',
  'history',
  'opener',
  'parent',
  'top',
  'frames',
  'open',
  'alert',
  'confirm',
  'prompt',
] as const;

function buildPrelude(names: readonly string[]): string {
  return `"use strict";\n${names.map((g) => `const ${g} = undefined;`).join('\n')}\n`;
}

/** Strict-mode prelude neutering network/comms/global access for worker runs. */
export function buildSandboxPrelude(): string {
  return buildPrelude(WORKER_NEUTERED);
}

/** Sandbox prelude + DOM/storage neutering for the iframe. */
export function buildMainThreadPrelude(): string {
  return buildPrelude([...WORKER_NEUTERED, ...MAIN_THREAD_EXTRA]);
}

/** Names a test can assert stay unreachable inside snippet scope. */
export function neuteredNames(): string[] {
  return [...WORKER_NEUTERED];
}

/** DOM names additionally neutered in the iframe. */
export function mainThreadExtraNames(): string[] {
  return [...MAIN_THREAD_EXTRA];
}
