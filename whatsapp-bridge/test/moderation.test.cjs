const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeInbound } = require("../lib/ai/moderation");

test("analyzeInbound flags profanity and escalate", () => {
  const r = analyzeInbound("This is shit service");
  assert.equal(r.profanity, true);
  assert.equal(r.escalate, true);
});

test("analyzeInbound detects medical unsafe phrasing", () => {
  const r = analyzeInbound("diagnosis is cancer for sure");
  assert.equal(r.medicalUnsafe, true);
  assert.equal(r.escalate, true);
});

test("neutral text stays low risk", () => {
  const r = analyzeInbound("مرحبا أريد موعد غداً");
  assert.equal(r.escalate, false);
  assert.ok(r.score >= 0.9);
});
