import { NextRequest, NextResponse } from 'next/server';
import { requireModerator, requireAdmin } from '@/lib/middleware/moderation';
import { ok, fail } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const moderationActionSchema = z.enum(['ALLOW', 'BLOCK', 'REVIEW', 'FLAG']);
const moderationSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const moderationCategorySchema = z.enum(['SPAM', 'HARASSMENT', 'MISINFORMATION', 'ADULT_CONTENT', 'OTHER']);

const createRuleSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required'),
  category: moderationCategorySchema,
  action: moderationActionSchema,
  severity: moderationSeveritySchema.default('MEDIUM'),
});

const updateRuleSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  pattern: z.string().min(1).optional(),
  category: moderationCategorySchema.optional(),
  action: moderationActionSchema.optional(),
  severity: moderationSeveritySchema.optional(),
});

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
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Admin access required'), { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = createRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues),
        { status: 400 }
      );
    }

    const { pattern, category, action, severity } = validation.data;

    const regexValidation = validateRegexPattern(pattern);
    if (!regexValidation.valid) {
      return NextResponse.json(fail('VALIDATION_ERROR', regexValidation.error!), { status: 400 });
    }

    const newRule = await prisma.moderationRule.create({
      data: { pattern, category, action, severity },
    });

    return NextResponse.json(ok({ rule: newRule }));
  } catch (error) {
    logger.error('[moderation/rules] POST failed', { userId: session.user.id, error });
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to create rule'), {
      status: 500,
    });
  }
}

export async function PUT(request: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Admin access required'), { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = updateRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues),
        { status: 400 }
      );
    }

    const { id, pattern, category, action, severity } = validation.data;

    if (pattern) {
      const regexValidation = validateRegexPattern(pattern);
      if (!regexValidation.valid) {
        return NextResponse.json(fail('VALIDATION_ERROR', regexValidation.error!), { status: 400 });
      }
    }

    const updatedRule = await prisma.moderationRule.update({
      where: { id },
      data: {
        pattern,
        action,
        category,
        severity,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(ok({ rule: updatedRule }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('NotFound')) {
      return NextResponse.json(fail('NOT_FOUND', 'Rule not found'), { status: 404 });
    }
    logger.error('[moderation/rules] PUT failed', { userId: session.user.id, error });
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to update rule'), {
      status: 500,
    });
  }
}

export async function DELETE(request: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Admin access required'), { status: 403 });
  }

  try {
    const body = await request.json();

    const idValidation = z.object({ id: z.string().min(1) }).safeParse(body);
    if (!idValidation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'id is required'), { status: 400 });
    }

    await prisma.moderationRule.delete({
      where: { id: idValidation.data.id },
    });

    return NextResponse.json(ok({ success: true }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('NotFound')) {
      return NextResponse.json(fail('NOT_FOUND', 'Rule not found'), { status: 404 });
    }
    logger.error('[moderation/rules] DELETE failed', { userId: session.user.id, error });
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to delete rule'), {
      status: 500,
    });
  }
}
