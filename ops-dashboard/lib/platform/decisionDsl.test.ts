import { describe, expect, it } from "vitest";
import { evalDecisionDsl } from "@/lib/platform/decisionDsl";

describe("decision DSL", () => {
  it("supports all/any with numeric comparisons", () => {
    const expr = {
      all: [
        { metric: "state.severity", op: ">=", value: 2 },
        { any: [{ metric: "incidents.critical", op: ">", value: 0 }, { metric: "state.blast_radius", op: ">", value: 5 }] },
      ],
    } as any;
    expect(evalDecisionDsl(expr, { "state.severity": 2, "incidents.critical": 1, "state.blast_radius": 0 })).toBe(true);
    expect(evalDecisionDsl(expr, { "state.severity": 1, "incidents.critical": 1, "state.blast_radius": 10 })).toBe(false);
    expect(evalDecisionDsl(expr, { "state.severity": 3, "incidents.critical": 0, "state.blast_radius": 10 })).toBe(true);
  });

  it("supports string equality", () => {
    const expr = { metric: "state.global_status", op: "==", value: "incident" } as any;
    expect(evalDecisionDsl(expr, { "state.global_status": "incident" })).toBe(true);
    expect(evalDecisionDsl(expr, { "state.global_status": "healthy" })).toBe(false);
  });
});

