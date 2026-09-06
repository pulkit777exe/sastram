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

function isPrismaError(unknownError: unknown): unknownError is PrismaError {
  if (typeof unknownError !== 'object') return false;
  if (unknownError === null) return false;
  if (!('code' in unknownError)) return false;
  const errorCode = (unknownError as Record<string, unknown>).code;
  if (typeof errorCode !== 'string') return false;
  return true;
}

export function prismaErrorMessage(unknownError: unknown): string | null {
  if (!isPrismaError(unknownError)) return null;

  switch (unknownError.code) {
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

export function isPrismaUniqueConstraintError(unknownError: unknown): boolean {
  if (!isPrismaError(unknownError)) return false;
  return unknownError.code === PRISMA_UNIQUE_CONSTRAINT;
}

/**
 * Provider quota / rate-limit errors (429). Callers treat these as terminal:
 * a retry within the same job attempt won't help since the quota resets on the
 * provider's own clock, and retrying only amplifies the limit.
 *
 * Uses simple string checks instead of a dense regex so every trigger is
 * visible and grep-able.
 */
const HTTP_TOO_MANY_REQUESTS = 429;

export function isQuotaError(unknownError: unknown): boolean {
  if (!(unknownError instanceof Error)) return false;

  const lowerMessage = unknownError.message.toLowerCase();
  if (lowerMessage.includes('429')) return true;
  if (lowerMessage.includes('quota')) return true;
  if (lowerMessage.includes('resource_exhausted')) return true;
  if (lowerMessage.includes('rate limit')) return true;
  if (lowerMessage.includes('rate-limit')) return true;
  if (lowerMessage.includes('ratelimit')) return true;

  const errorWithStatus = unknownError as { status?: unknown };
  if (errorWithStatus.status === HTTP_TOO_MANY_REQUESTS) return true;

  return false;
}

// AppError messages are authored for end users. Everything else (Prisma, driver,
// third-party SDKs) can embed table names, connection strings or prompt content,
// so those messages stay server-side and clients get this instead.
const INTERNAL_ERROR_MESSAGE = 'An internal error occurred';

const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

export function handleError(rawError: unknown): {
  message: string;
  code?: string;
  statusCode: number;
} {
  if (rawError instanceof AppError) {
    return {
      message: rawError.message,
      code: rawError.code,
      statusCode: rawError.statusCode,
    };
  }

  if (isPrismaError(rawError)) {
    const prismaMessage = prismaErrorMessage(rawError);
    if (prismaMessage !== null) {
      return { message: prismaMessage, code: rawError.code, statusCode: HTTP_CONFLICT };
    }
  }

  if (rawError instanceof Error) {
    return {
      message: INTERNAL_ERROR_MESSAGE,
      code: 'INTERNAL_ERROR',
      statusCode: HTTP_INTERNAL_ERROR,
    };
  }

  return {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: HTTP_INTERNAL_ERROR,
  };
}
