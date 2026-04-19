const fs = require("fs");
const path = require("path");

function createDiskSendQueue(fileRelative) {
  const filePath = path.isAbsolute(fileRelative)
    ? fileRelative
    : path.join(process.cwd(), fileRelative);

  function ensureDir() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  function enqueue(job) {
    ensureDir();
    const line = JSON.stringify({
      enqueuedAt: Date.now(),
      attempts: 0,
      ...job,
    });
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  }

  function readAll() {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    return raw
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function rewrite(jobs) {
    ensureDir();
    if (!jobs.length) {
      fs.writeFileSync(filePath, "", "utf8");
      return;
    }
    fs.writeFileSync(filePath, `${jobs.map((j) => JSON.stringify(j)).join("\n")}\n`, "utf8");
  }

  return { enqueue, readAll, rewrite, filePath };
}

module.exports = { createDiskSendQueue };
