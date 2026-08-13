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

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
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
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string'
  );
}

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
 * Provider quota / rate-limit errors (429). Callers treat these as terminal:
 * a retry within the same job attempt won't help since the quota resets on the
 * provider's own clock, and retrying only amplifies the limit.
 */
const QUOTA_PATTERN = /429|quota|RESOURCE_EXHAUSTED|rate.?limit/i;

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (QUOTA_PATTERN.test(err.message)) return true;
  return (err as { status?: unknown }).status === 429;
}

// AppError messages are authored for end users. Everything else (Prisma, driver,
// third-party SDKs) can embed table names, connection strings or prompt content,
// so those messages stay server-side and clients get this instead.
const INTERNAL_ERROR_MESSAGE = 'An internal error occurred';

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
      message: INTERNAL_ERROR_MESSAGE,
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
