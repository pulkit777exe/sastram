import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { isSafePublicUrl } from './content-safety';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 512 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class UnsafeUrlError extends Error {
  constructor(message = 'URL must resolve to a public host') {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export type ResolveAddresses = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Test seam — production uses the OS resolver. */
  resolve?: ResolveAddresses;
}

export interface SafeFetchResponse {
  status: number;
  ok: boolean;
  url: string;
  location: string | null;
  text: string;
}

async function resolveWithDns(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Resolve once, validate every answer, and return the address the socket must
 * use. Fetching a hostname then letting the runtime resolve it again is a
 * DNS-rebinding SSRF: the second answer can be private even when the first was
 * public. Callers pin this address in the socket `lookup` below.
 */
export async function resolvePublicAddress(
  hostname: string,
  resolve: ResolveAddresses = resolveWithDns
): Promise<{ address: string; family: number }> {
  const bareHost = stripIpv6Brackets(hostname);
  const literalFamily = isIP(bareHost);
  if (literalFamily !== 0) {
    const probe = literalFamily === 6 ? `http://[${bareHost}]/` : `http://${bareHost}/`;
    if (!isSafePublicUrl(probe)) {
      throw new UnsafeUrlError('URL points to a private address');
    }
    return { address: bareHost, family: literalFamily };
  }

  const addresses = await resolve(hostname);
  if (addresses.length === 0) {
    throw new UnsafeUrlError('Host did not resolve to an address');
  }

  for (const entry of addresses) {
    const probe = entry.family === 6 ? `http://[${entry.address}]/` : `http://${entry.address}/`;
    if (!isSafePublicUrl(probe)) {
      throw new UnsafeUrlError('Host resolves to a private address');
    }
  }

  return addresses[0]!;
}

function pinnedLookup(address: string, family: number): LookupFunction {
  return (_hostname, options, callback) => {
    if (typeof options === 'object' && options.all === true) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

interface RawResponse {
  status: number;
  location: string | null;
  text: string;
}

function requestOnce(
  target: URL,
  resolved: { address: string; family: number },
  timeoutMs: number,
  maxBytes: number,
  headers: Record<string, string>
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const hostname = stripIpv6Brackets(target.hostname);
    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.request(
      {
        hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers,
        lookup: pinnedLookup(resolved.address, resolved.family),
        agent: false,
        servername: isHttps ? hostname : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;

        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy(new SafeFetchError('Response body too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const locationHeader = res.headers.location;
          resolve({
            status: res.statusCode ?? 0,
            location: typeof locationHeader === 'string' ? locationHeader : null,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
        res.on('error', reject);
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new SafeFetchError('Request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch an external URL without handing DNS back to the runtime. Every redirect
 * hop is revalidated and resolved to a pinned public address, so a domain that
 * flips from a public answer to 127.0.0.1 cannot reach the internal network.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const resolve = options.resolve ?? resolveWithDns;
  const headers = {
    'User-Agent': 'SastramBot/1.0 (+https://sastram.wtfpulkit.dev)',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Encoding': 'identity',
  };

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafePublicUrl(current.toString())) {
      throw new UnsafeUrlError();
    }

    const resolved = await resolvePublicAddress(current.hostname, resolve);
    const response = await requestOnce(current, resolved, timeoutMs, maxBytes, headers);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return {
        ...response,
        ok: response.status >= 200 && response.status < 300,
        url: current.toString(),
      };
    }

    if (response.location === null) {
      return {
        ...response,
        ok: false,
        url: current.toString(),
      };
    }

    try {
      current = new URL(response.location, current);
    } catch {
      throw new UnsafeUrlError('Invalid redirect URL');
    }
  }

  throw new SafeFetchError('Too many redirects');
}
