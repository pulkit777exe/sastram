import { z } from 'zod';

export const policyRoleSchema = z.enum(['ADMIN', 'MODERATOR', 'USER']);
