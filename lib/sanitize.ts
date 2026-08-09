import sanitizeHtml from 'sanitize-html';

// Best-effort prompt-injection scrub before the query reaches an LLM.
// Not a security boundary — the model prompt is still built defensively.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (previous|above|all) instructions?/gi,
  /you are now/gi,
  /system prompt/gi,
  /\[INST\]|\[\/INST\]/g,
  /<<SYS>>|<<\/SYS>>/g,
  /<\|.*?\|>/g,
];

export function sanitizeSearchQuery(raw: string): string {
  const stripped = sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} });
  const cleaned = INJECTION_PATTERNS.reduce((acc, re) => acc.replace(re, ''), stripped);
  return cleaned.trim().replace(/\s+/g, ' ').substring(0, 500);
}

export function validateApiKeys(keys: { exa?: string; tavily?: string; gemini?: string }) {
  const exaKey = keys.exa?.trim();
  const tavilyKey = keys.tavily?.trim();
  const geminiKey = keys.gemini?.trim();

  // An absent key is "valid" here — callers decide whether a provider is required.
  const exaValid =
    !exaKey || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exaKey);
  const tavilyValid = !tavilyKey || (tavilyKey.startsWith('tvly-') && tavilyKey.length > 10);
  // Gemini keys come in several formats (AIza..., AQ...., and OAuth-issued ones),
  // so the last clause is a loose "looks like a token" fallback.
  const geminiValid =
    !geminiKey ||
    ((geminiKey.startsWith('AIza') || geminiKey.startsWith('AQ.')) && geminiKey.length >= 20) ||
    (geminiKey.length >= 15 && !/\s/.test(geminiKey));

  return {
    exaValid,
    tavilyValid,
    geminiValid,
    allValid: exaValid && tavilyValid && geminiValid,
  };
}
