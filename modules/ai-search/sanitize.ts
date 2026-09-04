import sanitizeHtml from 'sanitize-html';

// Best-effort prompt-injection scrub before the query reaches an LLM.
// Not a security boundary — the model prompt is still built defensively.

/** Catches "ignore previous instructions" style override attempts. */
const IGNORE_INSTRUCTIONS_PATTERN = /ignore (previous|above|all) instructions?/gi;

/** Catches "you are now ..." role hijack attempts. */
const ROLE_HIJACK_PATTERN = /you are now/gi;

/** Catches attempts to reveal or override the system prompt. */
const SYSTEM_PROMPT_PATTERN = /system prompt/gi;

/** Catches Mistral-style [INST] / [/INST] tags. */
const INST_TAG_PATTERN = /\[INST\]|\[\/INST\]/g;

/** Catches Llama-style <<SYS>> / <</SYS>> tags. */
const SYS_TAG_PATTERN = /<<SYS>>|<<\/SYS>>/g;

/** Catches generic pipe-delimited special tokens like <|im_start|> . */
const PIPE_TOKEN_PATTERN = /<\|.*?\|>/g;

const INJECTION_PATTERNS: RegExp[] = [
  IGNORE_INSTRUCTIONS_PATTERN,
  ROLE_HIJACK_PATTERN,
  SYSTEM_PROMPT_PATTERN,
  INST_TAG_PATTERN,
  SYS_TAG_PATTERN,
  PIPE_TOKEN_PATTERN,
];

export function sanitizeSearchQuery(raw: string): string {
  const stripped = sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} });

  let cleaned = stripped;
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  const trimmed = cleaned.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const truncated = normalized.substring(0, 500);
  return truncated;
}

// UUID validation helper — validates Exa API key shape.
// Alternatively could use z.string().uuid().safeParse(value).success from zod.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isGoogleKey(key: string): boolean {
  const hasGooglePrefix = key.startsWith('AIza') || key.startsWith('AQ.');
  return hasGooglePrefix && key.length >= 20;
}

function isPlausibleToken(key: string): boolean {
  return key.length >= 15 && !/\s/.test(key);
}

export function validateApiKeys(keys: { exa?: string; tavily?: string; gemini?: string }) {
  const exaKey = keys.exa?.trim();
  const tavilyKey = keys.tavily?.trim();
  const geminiKey = keys.gemini?.trim();

  // An absent key is "valid" here — callers decide whether a provider is required.
  const exaValid = !exaKey || isValidUuid(exaKey);
  const tavilyValid = !tavilyKey || (tavilyKey.startsWith('tvly-') && tavilyKey.length > 10);
  // Gemini keys come in several formats (AIza..., AQ...., and OAuth-issued ones),
  // so the last clause is a loose "looks like a token" fallback.
  const geminiValid = !geminiKey || isGoogleKey(geminiKey) || isPlausibleToken(geminiKey);

  return {
    exaValid,
    tavilyValid,
    geminiValid,
    allValid: exaValid && tavilyValid && geminiValid,
  };
}
