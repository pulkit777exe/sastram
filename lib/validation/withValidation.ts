import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { ApiResponse } from "@/lib/http/api-response";

type HandlerContext<TBody, TQuery> = {
  body: TBody;
  query: TQuery;
  request: NextRequest;
};

type HandlerConfig<TBody, TQuery> = {
  bodySchema?: ZodSchema<TBody>;
  querySchema?: ZodSchema<TQuery>;
  handler: (ctx: HandlerContext<TBody, TQuery>) => Promise<NextResponse>;
};

export function withValidation<TBody = unknown, TQuery = Record<string, string>>(
  config: HandlerConfig<TBody, TQuery>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const url = new URL(request.url);

      let body: TBody | undefined;
      if (config.bodySchema) {
        const json = await request.json().catch(() => ({}));
        const parsed = config.bodySchema.parse(json);
        body = sanitizeObject(parsed) as TBody;
      }

      let query: TQuery | undefined;
      if (config.querySchema) {
        const params = Object.fromEntries(url.searchParams.entries());
        const parsed = config.querySchema.parse(params);
        query = sanitizeObject(parsed) as TQuery;
      }

      // @ts-expect-error – we know body/query are present when schemas are provided
      return await config.handler({ body, query, request });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        const res: ApiResponse<null> = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.flatten(),
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: request.headers.get("x-request-id") ?? "",
          },
        };

        return NextResponse.json(res, { status: 400 });
      }

      const res: ApiResponse<null> = {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong",
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get("x-request-id") ?? "",
        },
      };

      return NextResponse.json(res, { status: 500 });
    }
  };
}

// Very small sanitization helper – trims strings and normalizes whitespace
function sanitizeObject<T>(value: T): T {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ") as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeObject(v)) as unknown as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeObject(v);
    }
    return result as T;
  }

  return value;
}

