import { z } from 'zod';
import { REPORT_STATUS } from '@/lib/config/constants';

const reportCategoryValues = [
  'SPAM',
  'HARASSMENT',
  'MISINFORMATION',
  'ADULT_CONTENT',
  'OTHER',
] as const;

export const createReportSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
  category: z.enum(reportCategoryValues),
  details: z.string().max(500, 'Details must be less than 500 characters').optional(),
});

const reportStatusValues = [
  REPORT_STATUS.PENDING,
  REPORT_STATUS.RESOLVED,
  REPORT_STATUS.DISMISSED,
] as const;

export const updateReportStatusSchema = z.object({
  reportId: z.string().cuid('Invalid report ID'),
  status: z.enum(reportStatusValues),
  resolution: z.string().max(1000).optional(),
});

export const getReportDetailsSchema = z.object({
  reportId: z.string().cuid('Invalid report ID'),
});

const suspensionDurationValues = ['1h', '6h', '24h', '3d', '7d', '30d'] as const;

const resolveActionValues = ['DISMISS', 'REMOVE_MESSAGE', 'WARN_USER', 'SUSPEND_USER', 'BAN_USER'] as const;

export const resolveReportSchema = z
  .object({
    reportId: z.string().cuid('Invalid report ID'),
    action: z.enum(resolveActionValues),
    note: z.string().trim().max(500, 'Please keep the note under 500 characters').optional().default(''),
    notifyReporter: z.boolean().default(true),
    duration: z.enum(suspensionDurationValues).optional(),
  })
  .superRefine((value, ctx) => {
    const isDismiss = value.action === 'DISMISS';
    if (isDismiss) {
      return;
    }
    const noteLength = value.note.trim().length;
    const needsNote = noteLength < 10;
    if (needsNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Please provide a resolution note',
      });
    }
  });

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
