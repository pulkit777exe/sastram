import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';

// Job status tracking is no longer available with QStash.
// QStash handles retries internally via its own infrastructure.
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    fail('NOT_IMPLEMENTED', 'Job status tracking is not available with QStash'),
    { status: 501 }
  );
}

export async function DELETE(_req: NextRequest) {
  return NextResponse.json(
    fail('NOT_IMPLEMENTED', 'Job cancellation is not available with QStash'),
    { status: 501 }
  );
}
