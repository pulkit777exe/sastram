/**
 * Shared validation utilities
 */

import { z } from "zod";
import { ValidationError } from "./errors";

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const firstError = result.error.issues[0];
  const errorMessage = firstError
    ? `${firstError.path.join(".")}: ${firstError.message}`
    : "Validation failed";

  return { success: false, error: errorMessage };
}

/**
 * Validate and throw on error
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  field?: string
): T {
  const result = validate(schema, data);

  if (!result.success) {
    throw new ValidationError(result.error, field);
  }

  return result.data;
}

/**
 * Parse form data with validation
 */
export function parseFormData<T>(
  schema: z.ZodSchema<T>,
  formData: FormData
): { success: true; data: T } | { success: false; error: string } {
  const data: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }

  return validate(schema, data);
}

