import { z } from "zod";
import { REPORT_STATUS } from "@/lib/config/constants";

/**
 * Report validation schemas
 */

export const createReportSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
  reason: z.string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason must be less than 500 characters"),
});

export const updateReportStatusSchema = z.object({
  reportId: z.string().cuid("Invalid report ID"),
  status: z.enum([
    REPORT_STATUS.REVIEWING,
    REPORT_STATUS.RESOLVED,
    REPORT_STATUS.DISMISSED,
  ] as [string, ...string[]]),
});

