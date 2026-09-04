import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";
import { logInfo } from "@/lib/logging/log";

// CSP violation sink. Deliberately UNAUTHENTICATED — a violation can happen on
// the sign-in page, and the browser sends these reports without credentials.
// It is therefore the only route in this app that takes input straight from the
// public internet, so it is written defensively:
//
//  - rate limited: withApi applies the per-IP bucket like every other route,
//  - bounded: an oversized body is rejected before it is ever parsed,
//  - allowlisted: only five known fields are read, each truncated,
//  - silent: the response never echoes any submitted value back.
//
// It writes nothing to the database and reads no user data.

const MAX_BODY_BYTES = 8_192;
const MAX_FIELD_CHARS = 256;

type Violation = {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  disposition?: string;
};

function field(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, MAX_FIELD_CHARS);
}

// Browsers send one of two shapes: the legacy `{"csp-report": {...}}` envelope
// with hyphenated keys, or the Reporting API's array of `{type, body}` with
// camelCase keys. Both are read; anything else is discarded.
function parseViolation(payload: unknown): Violation | null {
  if (Array.isArray(payload)) {
    const entry = payload.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "csp-violation",
    ) as { body?: Record<string, unknown> } | undefined;
    if (!entry?.body) return null;
    const b = entry.body;
    return {
      documentUri: field(b.documentURL),
      violatedDirective: field(b.effectiveDirective),
      effectiveDirective: field(b.effectiveDirective),
      blockedUri: field(b.blockedURL),
      disposition: field(b.disposition),
    };
  }

  const legacy = (payload as { "csp-report"?: Record<string, unknown> } | null)?.[
    "csp-report"
  ];
  if (!legacy || typeof legacy !== "object") return null;
  return {
    documentUri: field(legacy["document-uri"]),
    violatedDirective: field(legacy["violated-directive"]),
    effectiveDirective: field(legacy["effective-directive"]),
    blockedUri: field(legacy["blocked-uri"]),
    disposition: field(legacy.disposition),
  };
}

export const POST = withApi(async ({ request, requestId }) => {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse(
      ERROR_CODES.INVALID_REQUEST,
      "Report too large",
      413,
      undefined,
      requestId,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return errorResponse(
      ERROR_CODES.INVALID_REQUEST,
      "Malformed report",
      400,
      undefined,
      requestId,
    );
  }

  const violation = parseViolation(payload);
  // A report with no recognisable directive is noise, not a violation — logging
  // it would let anyone fill the log with entries of their choosing.
  if (!violation?.effectiveDirective && !violation?.violatedDirective) {
    return errorResponse(
      ERROR_CODES.INVALID_REQUEST,
      "Unrecognised report",
      400,
      undefined,
      requestId,
    );
  }

  logInfo(requestId, "csp_violation", violation);

  // 202 with the standard envelope: accepted, nothing to say back.
  return successResponse(null, 202, requestId);
});
