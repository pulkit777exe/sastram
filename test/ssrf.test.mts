import { describe, it } from 'mocha';
import { expect } from 'chai';
import { isSafePublicUrl } from '@/lib/services/content-safety';

/**
 * Table-driven coverage for lib/services/content-safety.ts isSafePublicUrl,
 * the gate used by fork-external, challenge, link-preview, and profile
 * website actions.
 *
 * IPv6 literals arrive from WHATWG `URL.hostname` wrapped in brackets, so the
 * gate parses them into bytes before classifying: unspecified, loopback,
 * ULA (fc00::/7), link-local (fe80::/10), multicast (ff00::/8) and
 * IPv4-mapped/compatible addresses whose embedded IPv4 is private are all
 * blocked. Decimal/hex/octal IPv4 literals behave as intended because the URL
 * parser normalizes those hosts to dotted-decimal first.
 */

describe('isSafePublicUrl (SSRF gate)', () => {
  const blocked: Array<{ name: string; url: string }> = [
    // Private / reserved IPv4
    { name: 'IPv4 loopback', url: 'http://127.0.0.1/' },
    { name: 'IPv4 loopback with port', url: 'http://127.0.0.1:8080/admin' },
    { name: 'IPv4 loopback short form', url: 'https://127.1/' },
    { name: 'RFC1918 10/8', url: 'http://10.0.0.1/' },
    { name: 'RFC1918 192.168/16', url: 'http://192.168.1.1/router' },
    { name: 'RFC1918 172.16/12 lower bound', url: 'http://172.16.0.1/' },
    { name: 'RFC1918 172.16/12 upper bound', url: 'http://172.31.255.255/' },
    { name: 'unspecified address', url: 'http://0.0.0.0/' },
    { name: 'this-network 0.0.0.0/8', url: 'http://0.1.2.3/' },
    // CGNAT RFC 6598
    { name: 'CGNAT lower bound', url: 'http://100.64.0.1/' },
    { name: 'CGNAT upper bound', url: 'http://100.127.255.255/' },
    // IPv6 literals (WHATWG hostname keeps the brackets)
    { name: 'IPv6 unspecified ::', url: 'http://[::]/' },
    { name: 'IPv6 loopback ::1', url: 'http://[::1]/' },
    { name: 'IPv6 loopback with port', url: 'http://[::1]:8080/admin' },
    { name: 'IPv6 loopback expanded form', url: 'http://[0:0:0:0:0:0:0:1]/' },
    { name: 'IPv6 ULA fc00::/7', url: 'http://[fc00::1]/' },
    { name: 'IPv6 ULA fd00::/8', url: 'http://[fd12:3456::1]/' },
    { name: 'IPv6 link-local fe80::/10', url: 'http://[fe80::1]/' },
    { name: 'IPv6 link-local upper bound feb0::/10', url: 'http://[febf::1]/' },
    { name: 'IPv6 multicast ff00::/8', url: 'http://[ff02::1]/' },
    { name: 'IPv4-mapped loopback dotted', url: 'http://[::ffff:127.0.0.1]/' },
    { name: 'IPv4-mapped loopback hex', url: 'http://[::ffff:7f00:1]/' },
    { name: 'IPv4-mapped RFC1918', url: 'http://[::ffff:192.168.1.1]/' },
    { name: 'IPv4-mapped CGNAT', url: 'http://[::ffff:100.64.0.1]/' },
    // Link-local / cloud metadata
    { name: 'cloud metadata IP', url: 'http://169.254.169.254/latest/meta-data/' },
    { name: 'metadata IP behind userinfo', url: 'http://user:pass@169.254.169.254/' },
    { name: 'GCP metadata hostname', url: 'http://metadata.google.internal/computeMetadata/v1/' },
    { name: 'GCP metadata short hostname', url: 'http://metadata.google/' },
    { name: 'arbitrary .internal hostname', url: 'http://foo.internal/' },
    // localhost variants
    { name: 'localhost', url: 'http://localhost/' },
    { name: 'localhost uppercase', url: 'http://LOCALHOST/' },
    { name: 'localhost with port', url: 'http://localhost:3000/' },
    { name: '.local suffix', url: 'http://intranet.local/' },
    // Numeric IP encodings (WHATWG parser normalizes these to 127.0.0.1)
    { name: 'decimal-encoded loopback', url: 'http://2130706433/' },
    { name: 'hex-encoded loopback', url: 'http://0x7f000001/' },
    { name: 'octal-encoded loopback', url: 'http://0177.0.0.1/' },
    { name: 'dotted-hex loopback', url: 'http://0x7f.0.0.1/' },
    // Rebinding / tunneling hostnames
    { name: 'nip.io suffix', url: 'http://foo.nip.io/' },
    { name: 'nip.io with loopback label', url: 'http://127.0.0.1.nip.io/' },
    { name: 'xip.io suffix', url: 'http://x.xip.io/' },
    { name: 'sslip.io suffix', url: 'http://a.sslip.io/' },
    { name: 'trycloudflare suffix', url: 'http://tunnel.trycloudflare.com/' },
    // Userinfo trickery: the real host is after the @
    { name: 'userinfo hiding loopback host', url: 'http://evil.com@127.0.0.1/' },
    // Non-http(s) schemes and unparseable input
    { name: 'ftp scheme', url: 'ftp://example.com/' },
    { name: 'file scheme', url: 'file:///etc/passwd' },
    { name: 'javascript scheme', url: 'javascript:alert(1)' },
    { name: 'data scheme', url: 'data:text/html,<script>alert(1)</script>' },
    { name: 'ws scheme', url: 'ws://example.com/' },
    { name: 'mailto scheme', url: 'mailto:user@example.com' },
    { name: 'garbage input', url: 'not a url' },
    { name: 'empty string', url: '' },
    { name: 'protocol-relative without base', url: '//example.com/' },
  ];

  const allowed: Array<{ name: string; url: string }> = [
    { name: 'plain https', url: 'https://example.com/' },
    { name: 'https with path, query, fragment', url: 'https://sub.example.com/path?q=1#frag' },
    { name: 'plain http', url: 'http://example.com/' },
    { name: 'non-default https port', url: 'https://example.com:8443/' },
    { name: 'public IPv4', url: 'https://1.1.1.1/' },
    { name: '172.15 just below private range', url: 'http://172.15.0.1/' },
    { name: '172.32 just above private range', url: 'http://172.32.0.1/' },
    { name: 'userinfo on a public host', url: 'https://user:pass@example.com/' },
    { name: 'localhost as a hostname label, not the host', url: 'https://localhost.example.com/' },
    { name: 'public-looking IPv6 documentation range', url: 'https://[2001:db8::1]/' },
    { name: 'global unicast IPv6', url: 'https://[2606:4700:4700::1111]/' },
    { name: 'IPv4-mapped public address', url: 'https://[::ffff:8.8.8.8]/' },
  ];

  for (const { name, url } of blocked) {
    it(`blocks ${name}: ${url}`, () => {
      expect(isSafePublicUrl(url)).to.equal(false);
    });
  }

  for (const { name, url } of allowed) {
    it(`allows ${name}: ${url}`, () => {
      expect(isSafePublicUrl(url)).to.equal(true);
    });
  }

  it('over-blocks public hostnames that begin with a private-IP prefix (documented false positive)', () => {
    // The anchored regex cannot tell "127.0.0.1.evil.com" from a real loopback
    // host; the conservative result is "unsafe".
    expect(isSafePublicUrl('http://127.0.0.1.evil.com/')).to.equal(false);
    expect(isSafePublicUrl('http://10.example.com/')).to.equal(false);
  });
});
