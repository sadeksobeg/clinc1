/**
 * Skips Puppeteer's browser download during npm install.
 * whatsapp-web.js uses WA_CHROME_PATH (see .env) for the real browser.
 */
module.exports = {
  skipDownload: true,
};
