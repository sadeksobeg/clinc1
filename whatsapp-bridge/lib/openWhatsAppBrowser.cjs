"use strict";

const { spawn } = require("child_process");

/**
 * فتح https://web.whatsapp.com في المتصفح الافتراضي — للتحقق اليدوي فقط.
 *
 * - استدعِ يدويًا: `npm run open:wa-web` (force=true)
 * - أو ضع OPEN_WHATSAPP_BROWSER=1 مع استدعاء برمجي بدون force (نادر)
 *
 * لا تُشغَّل تلقائيًا أثناء تشغيل الجسر حتى لا يتصادم مع Chromium الخاص بـ Puppeteer على Windows.
 */
function openWhatsAppBrowserInDefaultClient(options = {}) {
  const force = options.force === true;
  if (!force && String(process.env.OPEN_WHATSAPP_BROWSER || "0").trim() !== "1") {
    return;
  }
  const url = "https://web.whatsapp.com";
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
    console.log("[bridge] فتح متصفح واتساب ويب (تحقق يدوي — لا يستخدم جلسة الجسر)");
  } catch (e) {
    console.warn("[bridge] تعذر فتح المتصفح:", e && e.message ? e.message : e);
  }
}

module.exports = { openWhatsAppBrowserInDefaultClient };
