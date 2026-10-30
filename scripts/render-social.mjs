import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const svg = await readFile(
  new URL("../src/assets/social.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({
    path: new URL("../public/social.png", import.meta.url).pathname,
  });
} finally {
  await browser.close();
}
