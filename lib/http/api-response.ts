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
      requestId: requestId ?? "",
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
      requestId: requestId ?? "",
    },
  };
}

