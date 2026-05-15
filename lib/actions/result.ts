export type ActionErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ActionEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  errorCode: ActionErrorCode | null;
}

export function actionFailure<T = null>(
  code: ActionErrorCode,
  message: string
): ActionEnvelope<T> {
  return {
    ok: false,
    data: null,
    error: message,
    errorCode: code,
  };
}
