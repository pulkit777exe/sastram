import { NextResponse } from 'next/server';
import { CODE_SANDBOX_CSP } from '@/lib/config/code-sandbox';

/**
 * Bootstrap document for the code runner's sandboxed iframe.
 *
 * The iframe is sandboxed with `allow-scripts` only, so this document gets an
 * opaque origin and cannot read the app's DOM, cookies, or storage. The proxy
 * adds the same CSP to the response; connect-src 'none' blocks network access
 * even if a snippet escapes the prelude.
 *
 * User code and the prelude arrive over postMessage. The token is kept in this
 * closure so snippet code cannot forge a result message.
 */
const SANDBOX_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
(function () {
  'use strict';
  var MAX_OUTPUT_CHARS = 4000;

  function stringifyValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    try { return JSON.stringify(value, null, 2) || String(value); } catch (_) { return String(value); }
  }

  function truncateOutput(text) {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    return text.slice(0, MAX_OUTPUT_CHARS) + '\\n… [truncated]';
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== 'run' || typeof data.token !== 'string' || typeof data.prelude !== 'string' || typeof data.code !== 'string') return;

    var token = data.token;
    var logs = [];

    function reply(error) {
      window.parent.postMessage({
        type: 'result',
        token: token,
        output: truncateOutput(logs.join('\\n')),
        error: error
      }, '*');
    }

    var mockConsole = {
      log: function () { logs.push(Array.prototype.map.call(arguments, stringifyValue).join(' ')); },
      warn: function () { logs.push(Array.prototype.map.call(arguments, stringifyValue).join(' ')); },
      error: function () { logs.push(Array.prototype.map.call(arguments, stringifyValue).join(' ')); },
      info: function () { logs.push(Array.prototype.map.call(arguments, stringifyValue).join(' ')); },
      debug: function () { logs.push(Array.prototype.map.call(arguments, stringifyValue).join(' ')); }
    };

    try {
      var fn = new Function('console', data.prelude + '\\n' + data.code);
      var result = fn(mockConsole);
      if (result && typeof result.then === 'function') {
        result.then(function (awaited) {
          if (awaited !== undefined) logs.push(stringifyValue(awaited));
          reply(null);
        }, function (error) {
          reply(error && error.message ? error.message : String(error));
        });
      } else {
        if (result !== undefined) logs.push(stringifyValue(result));
        reply(null);
      }
    } catch (error) {
      reply(error && error.message ? error.message : String(error));
    }
  });

  window.parent.postMessage({ type: 'ready' }, '*');
})();
</script>
</body>
</html>`;

export function GET() {
  return new NextResponse(SANDBOX_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': CODE_SANDBOX_CSP,
    },
  });
}
