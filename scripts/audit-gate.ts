import { execFileSync } from 'child_process';

interface AuditAdvisory {
  id: number;
  url: string;
  title: string;
  severity: string;
  vulnerable_versions: string;
}

type AuditReport = Record<string, AuditAdvisory[]>;

interface AllowlistEntry {
  reason: string;
  /** ISO date — the gate fails once triage is older than this. */
  reviewBy: string;
}

/**
 * Documented exceptions. Every entry must name the exact advisory and carry
 * a review date so acceptance expires instead of rotting. Anything not
 * listed here fails the build at high/critical severity.
 */
const ALLOWLIST: Record<string, AllowlistEntry> = {
  'braces::GHSA-VFJ7-8CJW-P6XM': {
    reason:
      'dev-only chain (eslint-config-next > fast-glob > micromatch > braces): never bundled, never imported at runtime, lint inputs are repo files. No published fix (bun audit fix: 0 of 1 fixable).',
    reviewBy: '2027-04-13',
  },
};

const FAIL_SEVERITIES = new Set(['high', 'critical']);

function ghsaFromUrl(url: string): string {
  const tail = url.split('/').pop() ?? url;
  return tail.toUpperCase();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function main(): void {
  let raw: string;
  try {
    raw = execFileSync('bun', ['audit', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // `bun audit` exits non-zero when findings exist — the JSON report still
    // arrives on stdout, so recover it instead of treating it as a runner error.
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === 'string' && stdout.trim().length > 0) {
      raw = stdout;
    } else {
      console.error('[audit-gate] `bun audit --json` failed to run:', (error as Error).message);
      process.exit(1);
    }
  }

  let report: AuditReport;
  try {
    report = JSON.parse(raw) as AuditReport;
  } catch {
    console.error('[audit-gate] could not parse `bun audit --json` output');
    process.exit(1);
  }

  const today = todayIso();
  let violations = 0;
  let allowed = 0;
  let noted = 0;

  for (const [pkg, advisories] of Object.entries(report)) {
    for (const adv of advisories) {
      const ghsa = ghsaFromUrl(adv.url);
      const key = `${pkg}::${ghsa}`;
      const severity = adv.severity.toLowerCase();
      const entry = ALLOWLIST[key];

      if (!FAIL_SEVERITIES.has(severity)) {
        noted++;
        console.log(`[audit-gate] NOTE ${severity} ${key}: ${adv.title}`);
        continue;
      }

      if (entry && entry.reviewBy >= today) {
        allowed++;
        console.log(
          `[audit-gate] ALLOWED ${severity} ${key} (review by ${entry.reviewBy}): ${adv.title}`
        );
        continue;
      }

      violations++;
      if (entry) {
        console.error(
          `[audit-gate] VIOLATION ${severity} ${key}: allowlist triage expired ${entry.reviewBy} — re-triage required. ${adv.title}`
        );
      } else {
        console.error(
          `[audit-gate] VIOLATION ${severity} ${key}: ${adv.title} (fix with \`bun audit fix\` or add a documented exception)`
        );
      }
    }
  }

  console.log(
    `[audit-gate] ${violations} violation(s), ${allowed} allowed, ${noted} below-threshold.`
  );
  if (violations > 0) process.exit(1);
  console.log('[audit-gate] dependency audit gate passed.');
}

main();
