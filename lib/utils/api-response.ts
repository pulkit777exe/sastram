import { NextRequest, NextResponse } from 'next/server';
import { handleError } from './errors';
import { logger, generateRequestId } from '@/lib/infrastructure/logger';

type ApiHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withErrorHandling(handler: ApiHandler): ApiHandler {
  return async (request, context) => {
    const requestId = generateRequestId();

    try {
      const response = await handler(request, context);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      const { message, code, statusCode } = handleError(error);

      // handleError deliberately strips non-AppError messages before they reach
      // the client, so the real one only exists in the log line below.
      logger.error(`API Error: ${code}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path: request.nextUrl.pathname,
      });

      return NextResponse.json(
        fail(code ?? 'INTERNAL_ERROR', message, undefined, requestId),
        { status: statusCode, headers: { 'x-request-id': requestId } }
      );
    }
  };
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

function metadata(requestId?: string) {
  return { timestamp: new Date().toISOString(), requestId: requestId ?? '' };
}

export function ok<T>(data: T, requestId?: string): ApiResponse<T> {
  return { success: true, data, metadata: metadata(requestId) };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): ApiResponse<null> {
  return {
    success: false,
    error: { code, message, details },
    metadata: metadata(requestId),
  };
}
