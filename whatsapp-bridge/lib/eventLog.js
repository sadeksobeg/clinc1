const fs = require("fs");
const path = require("path");

function createEventLogger(eventLogFile) {
  function logEvent(eventType, payload = {}) {
    try {
      const absolutePath = path.isAbsolute(eventLogFile)
        ? eventLogFile
        : path.join(process.cwd(), eventLogFile);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      const line = JSON.stringify({
        at: new Date().toISOString(),
        eventType,
        ...payload,
      });
      fs.appendFileSync(absolutePath, `${line}\n`, "utf8");
    } catch (error) {
      console.error("[bridge] failed writing event log:", error?.message || error);
    }
  }
  return { logEvent };
}

module.exports = { createEventLogger };
