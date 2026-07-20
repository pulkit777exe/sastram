import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';

// CSP report collector for Content-Security-Policy-Report-Only. Logs violations
// so the policy can be tightened before flipping to enforcing mode. Returns 204
// (browsers expect an empty 200/204 for report-uri).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // CSP reports are wrapped in { "csp-report": { ... } } for report-uri.
    const report = body['csp-report'] ?? body;
    logger.warn('[csp-report] violation', {
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      effectiveDirective: report['effective-directive'],
      documentUri: report['document-uri'],
      originalPolicy: report['original-policy'],
    });
  } catch {
    // Never fail loudly on a report; it's observational only.
  }
  return new NextResponse(null, { status: 204 });
}
