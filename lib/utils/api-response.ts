import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleError } from './errors';
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

      logger.error(`API Error: ${code}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        path: request.nextUrl.pathname,
      });

      return NextResponse.json(
        { error: message, code, requestId },
        { status: statusCode, headers: { 'x-request-id': requestId } }
      );
    }
  };
}

export async function successResponse<T>(data: T, status = 200): Promise<NextResponse> {
  return NextResponse.json({ data }, { status });
}

export async function errorResponse(message: string, status = 400): Promise<NextResponse> {
  return NextResponse.json({ error: message }, { status });
}

export async function validationErrorResponse(issues: string[]): Promise<NextResponse> {
  return NextResponse.json({ error: 'Validation failed', details: issues }, { status: 400 });
}

export async function unauthorizedResponse(message = 'Unauthorized'): Promise<NextResponse> {
  return NextResponse.json({ error: message, code: 'UNAUTHORIZED' }, { status: 401 });
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

export function ok<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: requestId ?? '',
    },
  };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): ApiResponse<null> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: requestId ?? '',
    },
  };
}