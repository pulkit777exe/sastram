export function slugify(text: string): string {
  const lower = text.toLowerCase();
  const trimmed = lower.trim();
  // Replace any run of non-alphanumeric chars with a single dash.
  const hyphenated = trimmed.replace(/[^a-z0-9]+/g, '-');
  // Strip leading/trailing dashes left by the previous step.
  const cleaned = hyphenated.replace(/^-+|-+$/g, '');
  return cleaned;
}
