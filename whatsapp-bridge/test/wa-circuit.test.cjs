const test = require("node:test");
const assert = require("node:assert/strict");
const { createWaCircuit } = require("../lib/waCircuit");

test("circuit opens after threshold disconnects within window", () => {
  const metrics = { inc: () => {} };
  const events = [];
  const logEvent = (name, payload) => events.push({ name, payload });
  const config = {
    waCbWindowMs: 60_000,
    waCbDisconnectThreshold: 3,
    waCbCooldownMs: 5000,
    waRepairCacheOnCircuit: false,
  };
  const c = createWaCircuit(config, { logEvent, metrics });
  c.recordDisconnect("test");
  c.recordDisconnect("test");
  assert.equal(c.msUntilReconnectAllowed(), 0);
  c.recordDisconnect("test");
  assert.ok(c.msUntilReconnectAllowed() > 0);
  c.recordConnectSuccess();
  assert.equal(c.msUntilReconnectAllowed(), 0);
});
