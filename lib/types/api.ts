export type ApiError = {
  message: string;
  code: string;
  details?: unknown;
};

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };
