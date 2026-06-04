import type { SessionPayload } from '@/modules/auth/session';

export type AuthPolicyRole = 'ADMIN' | 'MODERATOR' | 'USER';

export type AuthorizedSession = SessionPayload;
