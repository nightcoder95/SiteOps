import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { generateRequestId } from "@/lib/utils/requestId";

export function errorResponse(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown,
  requestId?: string
) {
  const id = requestId || generateRequestId();

  const errorObj: Record<string, unknown> = {
    code,
    message,
  };

  if (details !== undefined) {
    errorObj.details = details;
  }

  return NextResponse.json(
    {
      success: false,
      error: errorObj,
      meta: {
        requestId: id,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

export function validationErrorResponse(error: ZodError, requestId?: string) {
  const fieldErrors = error.flatten().fieldErrors;
  return errorResponse(
    "VALIDATION_ERROR",
    "One or more fields are invalid",
    400,
    fieldErrors,
    requestId
  );
}

export function successResponse(data: unknown, status = 200, requestId?: string) {
  const id = requestId || generateRequestId();

  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        requestId: id,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}
