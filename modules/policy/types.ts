import type { SessionPayload } from '@/modules/auth/session';

export type AuthPolicyRole = 'ADMIN' | 'MODERATOR' | 'SUPER_ADMIN' | 'USER';

export type AuthorizedSession = SessionPayload;
