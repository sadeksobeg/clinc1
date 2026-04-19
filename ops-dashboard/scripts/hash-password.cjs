/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");

const pwd = process.argv[2] || "";
if (!pwd) {
  console.error("Usage: node scripts/hash-password.cjs <password>");
  process.exit(1);
}
console.log(bcrypt.hashSync(pwd, 10));
