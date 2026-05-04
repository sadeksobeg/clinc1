/**
 * Classify consumer / side-effect failures: retry vs terminal DLQ.
 * Used by docs and future TS workers; Node consumer mirrors PG codes in `classifyError.js`.
 */
export class TransientError extends Error {
  override readonly name = "TransientError";
  readonly kind = "transient" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class FatalServiceError extends Error {
  override readonly name = "FatalServiceError";
  readonly kind = "fatal" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export function isTransientError(e: unknown): boolean {
  if (e instanceof TransientError) return true;
  if (e instanceof FatalServiceError) return false;
  return false;
}

export function isFatalServiceError(e: unknown): boolean {
  return e instanceof FatalServiceError;
}
