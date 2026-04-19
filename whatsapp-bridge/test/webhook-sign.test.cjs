const test = require("node:test");
const assert = require("node:assert");
const { signPayload } = require("../lib/webhookSign");

test("signPayload is stable for same body", () => {
  const secret = "test-secret";
  const body = '{"a":1}';
  assert.strictEqual(signPayload(secret, body), signPayload(secret, body));
});

test("signPayload changes when body changes", () => {
  const secret = "test-secret";
  assert.notStrictEqual(signPayload(secret, '{"a":1}'), signPayload(secret, '{"a":2}'));
});
