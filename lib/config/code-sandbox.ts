/**
 * The code runner embeds this route in a sandboxed iframe. Keep the policy in
 * one place: the proxy applies it to the document response, and the route
 * repeats it so a direct request is still locked down.
 */
export const CODE_SANDBOX_PATH = '/code-sandbox';

export const CODE_SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');
