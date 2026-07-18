/**
 * Custom error classes for better error handling
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_RECORD_NOT_FOUND = 'P2025';
const PRISMA_FOREIGN_KEY = 'P2003';

interface PrismaError {
  code?: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(err: unknown): err is PrismaError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * Returns a user-facing error message for common Prisma errors.
 */
export function prismaErrorMessage(err: unknown): string | null {
  if (!isPrismaError(err)) return null;

  switch (err.code) {
    case PRISMA_UNIQUE_CONSTRAINT:
      return 'This record already exists';
    case PRISMA_RECORD_NOT_FOUND:
      return 'Record not found';
    case PRISMA_FOREIGN_KEY:
      return 'Related record not found';
    default:
      return null;
  }
}

export function isPrismaUniqueConstraintError(err: unknown): boolean {
  return isPrismaError(err) && err.code === PRISMA_UNIQUE_CONSTRAINT;
}

/**
 * Provider-side quota / rate-limit errors (HTTP 429). These are transient with
 * respect to the provider's own limits but not something a retry will fix within
 * the same job attempt — the AI spend cap / model quota resets on its own clock.
 * Treating them as terminal prevents background-job retry storms (which only
 * amplify the rate limit and pollute logs).
 */
const QUOTA_PATTERN = /429|quota|RESOURCE_EXHAUSTED|rate.?limit/i;

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (QUOTA_PATTERN.test(err.message)) return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status === 429) return true;
  return false;
}

/**
 * Handle errors consistently, translating Prisma errors to user-facing messages.
 */
export function handleError(error: unknown): {
  message: string;
  code?: string;
  statusCode: number;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }

  if (isPrismaError(error)) {
    const prismaMsg = prismaErrorMessage(error);
    if (prismaMsg) {
      return { message: prismaMsg, code: error.code, statusCode: 409 };
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    };
  }

  return {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  };
}


