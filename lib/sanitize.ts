import sanitizeHtml from "sanitize-html";

/**
 * Sanitizes a search query for safe use in AI prompts and API calls.
 * Strips HTML, removes prompt injection patterns, normalizes whitespace.
 */
export function sanitizeSearchQuery(raw: string): string {
  // 1. Strip all HTML
  const stripped = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // 2. Remove potential prompt injection patterns
  const noInjection = stripped
    .replace(/ignore (previous|above|all) instructions?/gi, "")
    .replace(/you are now/gi, "")
    .replace(/system prompt/gi, "")
    .replace(/\[INST\]|\[\/INST\]/g, "")
    .replace(/<<SYS>>|<<\/SYS>>/g, "")
    .replace(/<\|.*?\|>/g, "");

  // 3. Normalize whitespace and cap length
  return noInjection.trim().replace(/\s+/g, " ").substring(0, 500);
}

/**
 * Validates API key formats on the server side.
 * Keys are never stored or logged — only format-checked before calling external APIs.
 */
export function validateApiKeys(keys: {
  exa?: string;
  tavily?: string;
  gemini?: string;
}) {
  const exaValid =
    !keys.exa ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      keys.exa,
    );
  const tavilyValid = !keys.tavily || keys.tavily.startsWith("tvly-");
  const geminiValid = !keys.gemini || keys.gemini.startsWith("AIza");

  return {
    exaValid,
    tavilyValid,
    geminiValid,
    allValid: exaValid && tavilyValid && geminiValid,
  };
}
