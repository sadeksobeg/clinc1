import { describe, expect, it } from "vitest";
import { jaroWinklerSimilarity, matchDoctorByName } from "./doctorNameMatch";

describe("doctorNameMatch", () => {
  const doctors = [
    { id: 1, display_name: "د. سامي أحمد", specialty: "general" },
    { id: 2, display_name: "د. محمد علي", specialty: "cardiology" },
  ];

  it("exact family match on سامي", () => {
    const r = matchDoctorByName("سامي", doctors);
    expect(r.kind === "exact" || r.kind === "fuzzy").toBe(true);
    if (r.kind === "exact" || r.kind === "fuzzy") expect(r.doctor.id).toBe(1);
  });

  it("fuzzy match on typo", () => {
    expect(jaroWinklerSimilarity("سمي", "سامي")).toBeGreaterThan(0.8);
  });

  it("ambiguous when multiple close matches", () => {
    const r = matchDoctorByName("د", [{ id: 1, display_name: "د. أحمد", specialty: "a" }, { id: 2, display_name: "د. علي", specialty: "b" }], 0.5);
    expect(["ambiguous", "none"]).toContain(r.kind);
  });
});
