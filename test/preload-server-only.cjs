// Test-only stub for the `server-only` marker package. The marker throws when
// imported outside a React Server Component bundle; Mocha imports server
// modules directly, so stub it for the test process. Wired only into the
// `test` script, never into the app build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mock } = require('bun:test');

mock.module('server-only', () => ({}));
