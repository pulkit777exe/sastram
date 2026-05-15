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

export class ValidationError extends AppError {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
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


