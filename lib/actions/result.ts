/**
 * @deprecated — moved to @/lib/utils/server-action. This file remains as a
 * re-export shim so existing imports keep working; new code should import
 * from '@/lib/utils/server-action'.
 */
export type { ActionErrorCode, ActionEnvelope } from '@/lib/utils/server-action';
export { actionSuccess, actionFailure } from '@/lib/utils/server-action';
