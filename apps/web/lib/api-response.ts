export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  return { ok: false, error: { code, message, details } };
}

export function normalizeUnknownError(e: unknown, fallbackCode = "unknown_error", fallbackMessage = "Unexpected error") {
  if (e instanceof Error) return fail(fallbackCode, e.message);
  return fail(fallbackCode, fallbackMessage, e);
}

