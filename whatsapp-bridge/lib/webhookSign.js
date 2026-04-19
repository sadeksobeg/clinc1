const crypto = require("crypto");

function signPayload(secret, rawBodyUtf8) {
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(rawBodyUtf8, "utf8").digest("hex");
}

module.exports = { signPayload };
