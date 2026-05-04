import { describe, expect, it } from "vitest";
import { FatalServiceError, isFatalServiceError, isTransientError, TransientError } from "./eventErrors";

describe("eventErrors", () => {
  it("classifies TransientError", () => {
    const e = new TransientError("db blip");
    expect(isTransientError(e)).toBe(true);
    expect(isFatalServiceError(e)).toBe(false);
  });

  it("classifies FatalServiceError", () => {
    const e = new FatalServiceError("bad payload");
    expect(isTransientError(e)).toBe(false);
    expect(isFatalServiceError(e)).toBe(true);
  });
});
