import { z } from "zod";
import { REPORT_STATUS } from "@/lib/config/constants";

const reportCategoryValues = [
  "HATE_SPEECH",
  "HARASSMENT",
  "VIOLENCE_THREATS",
  "SELF_HARM",
  "ADULT_CONTENT",
  "SPAM",
  "SCAM_FRAUD",
  "MISINFORMATION",
  "IMPERSONATION",
  "PRIVATE_INFO",
  "COPYRIGHT",
  "OTHER",
] as const;

export const createReportSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
  category: z.enum(reportCategoryValues),
  details: z
    .string()
    .max(500, "Details must be less than 500 characters")
    .optional(),
});

export const updateReportStatusSchema = z.object({
  reportId: z.string().cuid("Invalid report ID"),
  status: z.enum([
    REPORT_STATUS.REVIEWING,
    REPORT_STATUS.RESOLVED,
    REPORT_STATUS.DISMISSED,
  ] as [string, ...string[]]),
  resolution: z.string().max(1000).optional(),
});

export const getReportDetailsSchema = z.object({
  reportId: z.string().cuid("Invalid report ID"),
});

export const resolveReportSchema = z.object({
  reportId: z.string().cuid("Invalid report ID"),
  action: z.enum([
    "DISMISS",
    "REMOVE_MESSAGE",
    "WARN_USER",
    "SUSPEND_USER",
    "BAN_USER",
  ]),
  resolution: z.string().min(10, "Please provide a resolution note").max(1000),
  notifyReporter: z.boolean().default(true),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
