/**
 * Split a PostgreSQL script into individual statements for drivers that only
 * execute one statement per query (the Neon HTTPS Data API, `pg` with
 * parameters, …).
 *
 * Tracks line and block comments, single-quoted strings ('' escape), quoted
 * identifiers ("" escape) and dollar-quoted bodies ($tag$…$tag$) so
 * semicolons inside `DO $$ … $$` blocks, function bodies or string literals
 * are not treated as separators.
 *
 * Comment-only fragments are dropped; a statement keeps the comments that
 * precede it.
 */
export function splitStatements(source: string): string[] {
  const stmts: string[] = [];
  let cur = '';
  let i = 0;
  const n = source.length;
  let state = 'plain' as 'plain' | 'lineComment' | 'blockComment' | 'single' | 'double' | 'dollar';
  let dollarTag = '';
  while (i < n) {
    const c = source[i];
    const c2 = source.slice(i, i + 2);
    if (state === 'plain') {
      if (c2 === '--') {
        state = 'lineComment';
        cur += c2;
        i += 2;
        continue;
      }
      if (c2 === '/*') {
        state = 'blockComment';
        cur += c2;
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'single';
        cur += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        state = 'double';
        cur += c;
        i += 1;
        continue;
      }
      if (c === '$') {
        const m = /^\$[A-Za-z_0-9]*\$/.exec(source.slice(i));
        if (m) {
          state = 'dollar';
          dollarTag = m[0];
          cur += dollarTag;
          i += dollarTag.length;
          continue;
        }
      }
      if (c === ';') {
        stmts.push(cur);
        cur = '';
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (state === 'lineComment') {
      cur += c;
      if (c === '\n') state = 'plain';
      i += 1;
      continue;
    }
    if (state === 'blockComment') {
      if (c2 === '*/') {
        cur += c2;
        state = 'plain';
        i += 2;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (state === 'single') {
      if (c2 === "''") {
        cur += c2;
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'plain';
        cur += c;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (state === 'double') {
      if (c2 === '""') {
        cur += c2;
        i += 2;
        continue;
      }
      if (c === '"') {
        state = 'plain';
        cur += c;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    // dollar-quoted body
    if (source.startsWith(dollarTag, i)) {
      cur += dollarTag;
      i += dollarTag.length;
      state = 'plain';
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts
    .map((s) => s.trim())
    .filter(
      (s) =>
        s
          .replace(/--[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim().length > 0
    );
}
