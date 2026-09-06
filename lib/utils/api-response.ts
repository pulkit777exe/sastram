import { NextRequest, NextResponse } from 'next/server';
import { handleError } from './errors';
import { logger, generateRequestId } from '@/lib/infrastructure/logger';

type ApiHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

function extractErrorMessage(rawError: unknown): string {
  if (rawError instanceof Error) return rawError.message;
  return String(rawError);
}

function extractErrorStack(rawError: unknown): string | undefined {
  if (rawError instanceof Error) return rawError.stack;
  return undefined;
}

export function withErrorHandling(handler: ApiHandler): ApiHandler {
  return async (request, context) => {
    const requestId = generateRequestId();

    try {
      const handlerResponse = await handler(request, context);
      handlerResponse.headers.set('x-request-id', requestId);
      return handlerResponse;
    } catch (rawError) {
      const normalizedError = handleError(rawError);
      const userMessage = normalizedError.message;
      const httpStatus = normalizedError.statusCode;

      let errorCode: string;
      if (normalizedError.code !== undefined && normalizedError.code.length > 0) {
        errorCode = normalizedError.code;
      } else {
        errorCode = 'INTERNAL_ERROR';
      }

      const logMessage = extractErrorMessage(rawError);
      const logStack = extractErrorStack(rawError);

      logger.error(`API Error: ${errorCode}`, {
        requestId,
        error: logMessage,
        stack: logStack,
        path: request.nextUrl.pathname,
      });

      const errorBody = fail(errorCode, userMessage, undefined, requestId);
      return NextResponse.json(errorBody, {
        status: httpStatus,
        headers: { 'x-request-id': requestId },
      });
    }
  };
}

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

const ERROR_CODE_STATUS_MAP: Record<string, number> = {
  VALIDATION_ERROR: HTTP_STATUS.BAD_REQUEST,
  AUTH_REQUIRED: HTTP_STATUS.UNAUTHORIZED,
  FORBIDDEN: HTTP_STATUS.FORBIDDEN,
  NOT_FOUND: HTTP_STATUS.NOT_FOUND,
  UNSUPPORTED_MEDIA_TYPE: HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
  RATE_LIMITED: HTTP_STATUS.RATE_LIMITED,
  SERVICE_UNAVAILABLE: HTTP_STATUS.SERVICE_UNAVAILABLE,
  GATEWAY_TIMEOUT: HTTP_STATUS.GATEWAY_TIMEOUT,
  INTERNAL_ERROR: HTTP_STATUS.INTERNAL,
};

export function errorCodeToStatus(errorCode: string | null): number {
  if (errorCode === null) return HTTP_STATUS.INTERNAL;
  return ERROR_CODE_STATUS_MAP[errorCode] ?? HTTP_STATUS.INTERNAL;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
  };
}

function buildMetadata(requestId?: string) {
  let resolvedRequestId: string;
  if (requestId !== undefined && requestId !== null && requestId.length > 0) {
    resolvedRequestId = requestId;
  } else {
    resolvedRequestId = '';
  }

  const timestamp = new Date().toISOString();
  return { timestamp, requestId: resolvedRequestId };
}

export function ok<T>(data: T, requestId?: string): ApiResponse<T> {
  const metadata = buildMetadata(requestId);
  return { success: true, data, metadata };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): ApiResponse<null> {
  const metadata = buildMetadata(requestId);
  return {
    success: false,
    error: { code, message, details },
    metadata,
  };
}
