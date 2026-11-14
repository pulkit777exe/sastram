#!/usr/bin/env tsx
/**
 * Phase 4 eval harness (on-demand).
 * Usage:
 *   bunx tsx scripts/eval-ai-search.ts [--limit N] [--mode quick|pro|deep] [--live] [--out file.json]
 *
 * Default is deterministic/offline mode: validates golden dataset + reports structural metrics
 * (no paid API calls). With --live, prints a scaffold report (real live measurement requires
 * configured app env/keys and explicit pipeline wiring in the target environment).
 */
import fs from 'node:fs';
import path from 'node:path';

type Golden = { id: string; query: string; type: string; mode: string };
type GoldenFile = { version: number; queries: Golden[] };

function readGolden(): GoldenFile {
  const p = path.join(process.cwd(), 'test/fixtures/ai-search-golden.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as GoldenFile;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1] || '40') : 40;
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  const golden = readGolden();
  const queries = golden.queries.slice(0, Math.max(1, limit));
  const started = Date.now();
  const results: Array<Record<string, unknown>> = [];

  if (!live) {
    const ids = new Set<string>();
    let schemaOk = true;
    for (const q of queries) {
      const valid = Boolean(q.id && q.query && q.mode && q.type);
      if (!valid || ids.has(q.id)) schemaOk = false;
      ids.add(q.id);
      results.push({ id: q.id, mode: q.mode, type: q.type, valid, citationValid: 'deterministic-check-only', latencyMs: null, costUsd: null });
    }
    const summary = {
      mode: 'offline-deterministic',
      total: queries.length,
      goldenCount: golden.queries.length,
      goldenCountOk: golden.queries.length === 40,
      uniqueIdsOk: ids.size === queries.length,
      schemaOk,
      latencyP50Ms: null,
      latencyP95Ms: null,
      avgCostUsd: null,
      durationMs: Date.now() - started,
      howToRunOnDemand: 'bunx tsx scripts/eval-ai-search.ts (offline) | bunx tsx scripts/eval-ai-search.ts --live --limit 10 --out eval.json (requires env/keys/wiring)',
      nightlyCIGate: 'Run deterministic gate in CI: bunx tsx scripts/eval-ai-search.ts (exits non-zero on schema/golden regression).',
    };
    const report = { summary, results };
    console.log(JSON.stringify(report, null, 2));
    if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    if (!summary.goldenCountOk || !summary.uniqueIdsOk || !summary.schemaOk) process.exit(1);
    return;
  }

  // Live scaffold: safe by default (no paid calls without explicit integration hook).
  const latencies: number[] = [];
  for (const q of queries) {
    results.push({ id: q.id, status: 'not_executed', reason: 'live execution requires configured keys/env and integration hook; run offline for CI-safe deterministic gate', latencyMs: null, citationValid: null, costUsd: null });
  }
  const summary = {
    mode: 'live-scaffold',
    total: queries.length,
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    citationValidityRate: null,
    avgCostUsd: null,
    durationMs: Date.now() - started,
    note: 'On-demand: wire executeAISearch+keys in this script for real latency/citation/cost. CI: deterministic offline gate is stable and free.',
  };
  const report = { summary, results };
  console.log(JSON.stringify(report, null, 2));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
