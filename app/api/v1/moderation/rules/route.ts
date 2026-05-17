import { NextRequest, NextResponse } from 'next/server';
import { requireModerator, requireAdmin } from '@/lib/middleware/moderation';
import { ok, fail } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';

export async function GET() {
  try {
    await requireModerator();
    const rules = await prisma.moderationRule.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(ok({ rules }));
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Moderator access required'), { status: 403 });
  }
}

/**
 * Validate regex pattern for ReDoS safety.
 * Checks: length limit, quantifier nesting depth, backreference count.
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
  if (pattern.length > 200) {
    return { valid: false, error: 'Pattern too long (max 200 chars)' };
  }

  // Test that it compiles
  try {
    new RegExp(pattern);
  } catch {
    return { valid: false, error: 'Invalid regex syntax' };
  }

  // Count nested quantifiers — patterns like ((a+)+)+ are ReDoS risks
  let depth = 0;
  let maxDepth = 0;
  for (const char of pattern) {
    if (char === '(') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === ')') {
      depth--;
    }
  }
  if (maxDepth > 4) {
    return { valid: false, error: 'Pattern has too many nested groups (max 4)' };
  }

  // Count backreferences — \1, \2 etc. can cause exponential backtracking
  const backrefs = pattern.match(/\\[1-9]/g);
  if (backrefs && backrefs.length > 2) {
    return { valid: false, error: 'Too many backreferences (max 2)' };
  }

  // Reject patterns with nested quantifiers on groups: (x+)+, (x*)+, etc.
  if (/\([^)]*[+*]\)[+*]/.test(pattern)) {
    return { valid: false, error: 'Nested quantifiers on groups are not allowed (e.g., (x+)+)' };
  }

  return { valid: true };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    if (!body.pattern || !body.category || !body.action) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'pattern, category and action are required'),
        { status: 400 }
      );
    }

    const regexValidation = validateRegexPattern(body.pattern);
    if (!regexValidation.valid) {
      return NextResponse.json(fail('VALIDATION_ERROR', regexValidation.error!), { status: 400 });
    }

    const newRule = await prisma.moderationRule.create({
      data: {
        pattern: body.pattern,
        action: body.action,
        category: body.category,
        severity: body.severity || 'MEDIUM',
      },
    });

    return NextResponse.json(ok({ rule: newRule }));
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to create rule'), {
      status: 500,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'id is required'), { status: 400 });
    }

    if (body.pattern) {
      const regexValidation = validateRegexPattern(body.pattern);
      if (!regexValidation.valid) {
        return NextResponse.json(fail('VALIDATION_ERROR', regexValidation.error!), { status: 400 });
      }
    }

    const updatedRule = await prisma.moderationRule.update({
      where: { id: body.id },
      data: {
        pattern: body.pattern,
        action: body.action,
        category: body.category,
        severity: body.severity,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(ok({ rule: updatedRule }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('NotFound')) {
      return NextResponse.json(fail('NOT_FOUND', 'Rule not found'), { status: 404 });
    }
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to update rule'), {
      status: 500,
    });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'id is required'), { status: 400 });
    }

    await prisma.moderationRule.delete({
      where: { id: body.id },
    });

    return NextResponse.json(ok({ success: true }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('NotFound')) {
      return NextResponse.json(fail('NOT_FOUND', 'Rule not found'), { status: 404 });
    }
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to delete rule'), {
      status: 500,
    });
  }
}
