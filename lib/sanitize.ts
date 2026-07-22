import sanitizeHtml from 'sanitize-html';

export function sanitizeSearchQuery(raw: string): string {
  const stripped = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
  });

  const noInjection = stripped
    .replace(/ignore (previous|above|all) instructions?/gi, '')
    .replace(/you are now/gi, '')
    .replace(/system prompt/gi, '')
    .replace(/\[INST\]|\[\/INST\]/g, '')
    .replace(/<<SYS>>|<<\/SYS>>/g, '')
    .replace(/<\|.*?\|>/g, '');

  return noInjection.trim().replace(/\s+/g, ' ').substring(0, 500);
}

export function validateApiKeys(keys: { exa?: string; tavily?: string; gemini?: string }) {
  const exaKey = keys.exa?.trim();
  const tavilyKey = keys.tavily?.trim();
  const geminiKey = keys.gemini?.trim();

  const exaValid =
    !exaKey || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exaKey);
  const tavilyValid = !tavilyKey || (tavilyKey.startsWith('tvly-') && tavilyKey.length > 10);
  
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