import { NextRequest, type NextResponse } from "next/server";
import { type ZodTypeAny } from "zod";

import { ERROR_CODES } from "@/lib/errors/codes";
import {
  errorResponse,
  validationErrorResponse,
} from "@/lib/errors/response";

export type ParseSuccess<T> = { ok: true; data: T };
export type ParseFailure = { ok: false; response: NextResponse };

export async function parseJsonBody(
  request: NextRequest,
  requestId: string
): Promise<ParseSuccess<unknown> | ParseFailure> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        ERROR_CODES.INVALID_REQUEST,
        "Invalid JSON",
        400,
        undefined,
        requestId
      ),
    };
  }
}

export function validateBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
  body: unknown,
  requestId: string
): ParseSuccess<ReturnType<TSchema["parse"]>> | ParseFailure {
  const validation = schema.safeParse(body);
  if (!validation.success) {
    return {
      ok: false,
      response: validationErrorResponse(validation.error, requestId),
    };
  }
  return { ok: true, data: validation.data as ReturnType<TSchema["parse"]> };
}
