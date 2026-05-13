import { NextResponse } from "next/server";

import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { logWarn } from "@/lib/logging/log";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

export function handleDbError(
  dbError: unknown,
  requestId?: string
): NextResponse | null {
  const err = dbError as PgError;

  const constraintMessages: Record<string, string> = {
    labour_entries_site_id_fk: "Site not found",
    material_entries_site_id_fk: "Site not found",
    machinery_entries_site_id_fk: "Site not found",
    expense_entries_site_id_fk: "Site not found",
    incident_reports_site_id_fk: "Site not found",
    field_requests_site_id_fk: "Site not found",
    resource_requests_site_id_fk: "Site not found",
    resource_requests_requested_by_fk: "Request user not found",
    resource_requests_approved_by_fk: "Approver user not found",
    notifications_user_id_fk: "Notification user not found",
    user_profiles_user_id_fk: "User not found",
    field_definitions_subcategory_id_fk: "Subcategory not found",
    field_definitions_subcategory_label_uidx: "Field label already exists in this subcategory",
    users_email_unique: "Email already in use",
  };

  switch (err.code) {
    case "23503":
      logWarn(requestId ?? "unknown", "FK violation", {
        constraint: err.constraint,
      });
      return errorResponse(
        ERROR_CODES.CONFLICT,
        constraintMessages[err.constraint ?? ""] || "Referenced record not found",
        409,
        undefined,
        requestId
      );
    case "23505":
      logWarn(requestId ?? "unknown", "Unique violation", {
        constraint: err.constraint,
      });
      return errorResponse(
        ERROR_CODES.CONFLICT,
        constraintMessages[err.constraint ?? ""] || "Duplicate entry",
        409,
        undefined,
        requestId
      );
    case "23502":
      logWarn(requestId ?? "unknown", "Not-null violation", {
        constraint: err.constraint,
      });
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        "Required field missing",
        400,
        undefined,
        requestId
      );
    case "23514":
      logWarn(requestId ?? "unknown", "Check violation", {
        constraint: err.constraint,
      });
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        "Value out of allowed range",
        400,
        undefined,
        requestId
      );
    default:
      return null;
  }
}
