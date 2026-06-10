import { ERROR_CODES } from '@/lib/errors/codes';

// User-facing copy keyed by the API's stable error code. Keeps developer/DB
// strings (validation internals, constraint names, GoTrue text) out of toasts —
// copy is controllable, localizable, and never leaks system detail (Part 6).
const FRIENDLY_COPY: Record<string, string> = {
  [ERROR_CODES.VALIDATION_ERROR]: 'Please check the form and try again.',
  [ERROR_CODES.INVALID_REQUEST]: 'That request could not be processed.',
  [ERROR_CODES.MISSING_FIELD]: 'Some required information is missing.',
  [ERROR_CODES.RATE_LIMITED]: 'Too many attempts — please wait a moment and try again.',
  [ERROR_CODES.UNAUTHORIZED]: 'Your session has expired. Please sign in again.',
  [ERROR_CODES.FORBIDDEN]: "You don't have permission to do that.",
  [ERROR_CODES.NOT_FOUND]: 'We couldn’t find what you were looking for.',
  [ERROR_CODES.RESOURCE_NOT_FOUND]: 'We couldn’t find what you were looking for.',
  [ERROR_CODES.CONFLICT]: 'That action conflicts with the current state — please refresh and retry.',
  [ERROR_CODES.INTERNAL_ERROR]: 'Something went wrong — please try again.',
  [ERROR_CODES.DATABASE_ERROR]: 'Something went wrong — please try again.',
  [ERROR_CODES.UNKNOWN_ERROR]: 'Something went wrong — please try again.',
};

export const GENERIC_ERROR_COPY = 'Something went wrong — please try again.';

// Resolve friendly copy from a code, falling back to the generic message. Never
// returns a raw backend string.
export function friendlyErrorMessage(code?: string): string {
  if (code && code in FRIENDLY_COPY) return FRIENDLY_COPY[code];
  return GENERIC_ERROR_COPY;
}
