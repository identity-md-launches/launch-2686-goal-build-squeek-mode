import { chromium, webkit, type Route } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { completion, networkFixture } from "./fixtures";

const output = resolve("test/scratch/browser-validation");
await mkdir(output, { recursive: true });
const root = resolve("dist");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    if (!pathname.startsWith("/preview/"))
      return new Response("Not found", { status: 404 });
    const path = resolve(
      root,
      pathname.slice("/preview/".length) || "index.html",
    );
    if (path !== root && !path.startsWith(root + sep))
      return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    return (await file.exists())
      ? new Response(file)
      : new Response("Not found", { status: 404 });
  },
});
const url = `http://127.0.0.1:${server.port}/preview/`;
const results: Array<{
  browser: string;
  checks: string[];
  errors: string[];
  axe: Record<string, unknown>;
}> = [];

try {
  for (const name of process.argv.includes("--webkit")
    ? ["webkit"]
    : ["chromium"]) {
    const browser = await (name === "webkit" ? webkit : chromium).launch({
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const result = {
      browser: name,
      checks: [] as string[],
      errors: [] as string[],
      axe: {} as Record<string, unknown>,
    };
    results.push(result);
    const check = (label: string) => result.checks.push(label);
    page.on("pageerror", (error) => result.errors.push(error.message));
    const consoleMessages: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleMessages.push(message.text());
    });
    let calls = 0,
      mode: "complete" | "pending" | "auth" = "complete",
      offline = false;
    let pending: Route | null = null;
    const fixture = networkFixture();
    fixture.latest.timestamp = `0x${Math.floor(Date.now() / 1000).toString(16)}`;
    // This nonce is only a memory-isolation test value, consumed by this mocked route.
    // No test credential is ever sent to an external service.
    const memoryNonce = crypto.randomUUID();
    await context.route("https://**/*", async (route) => {
      const request = route.request();
      const address = request.url();
      if (address === "https://openrouter.ai/api/v1/chat/completions") {
        if (request.method() === "OPTIONS") {
          await route.fulfill({
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "*",
              "Access-Control-Allow-Methods": "POST",
            },
          });
          return;
        }
        calls++;
        assert.equal(request.method(), "POST");
        assert.equal(request.headers().authorization, `Bearer ${memoryNonce}`);
        const body = request.postDataJSON();
        assert.equal(body.stream, true);
        assert.equal(body.provider.allow_fallbacks, false);
        assert.equal(body.tools, undefined);
        if (mode === "pending") {
          pending = route;
          return;
        }
        if (mode === "auth") {
          await route.fulfill({
            status: 401,
            body: "sensitive remote error text must never be displayed",
            headers: { "Access-Control-Allow-Origin": "*" },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: completion(
            'A useful answer, in one call.\n<img src=x onerror="window.unsafe=true">',
          ),
        });
      } else if (
        address.startsWith("https://api.squeekchain.com/") ||
        address.startsWith("https://ethereum-sepolia-rpc.publicnode.com/")
      ) {
        if (offline) {
          await route.abort("internetdisconnected");
          return;
        }
        const response = await fixture.fetcher(address, {
          method: request.method(),
          body: request.postData(),
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: await response.text(),
        });
      } else {
        await route.abort("blockedbyclient");
      }
    });
    try {
      await page.goto(url);
      await page.locator("h1").waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 390, 850, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 844,
        });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `overflow at ${width}`,
        );
        if (width === 390) {
          const action = await page
            .getByRole("button", { name: "Start chatting", exact: true })
            .boundingBox();
          assert(action && action.y + action.height < 844);
          check("390px first screen contains product and primary action");
          await page.screenshot({ path: `${output}/${name}-390.png` });
        }
        if (width === 1440)
          await page.screenshot({
            path: `${output}/${name}-1440.png`,
            fullPage: true,
          });
      }
      check("No horizontal overflow at 320, 390, 850 and 1440");
      await page.setViewportSize({ width: 390, height: 844 });
      const initialAudit = await new AxeBuilder({ page }).analyze();
      result.axe.initial = initialAudit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
      }));
      assert.equal(
        initialAudit.violations.length,
        0,
        JSON.stringify(result.axe.initial),
      );
      await page
        .getByRole("button", { name: "Start chatting", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      assert.equal(
        await page
          .locator("#api-key")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page
        .getByRole("button", { name: "Connect key", exact: true })
        .click();
      await page.getByRole("alert").waitFor();
      check("Empty key rejected with visible error");
      await page
        .getByLabel("OpenRouter API key", { exact: true })
        .fill(memoryNonce);
      await page.getByRole("checkbox").check();
      const keyAudit = await new AxeBuilder({ page }).analyze();
      result.axe.keyDialog = keyAudit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
      }));
      assert.equal(
        keyAudit.violations.length,
        0,
        JSON.stringify(result.axe.keyDialog),
      );
      await page
        .getByRole("button", { name: "Connect key", exact: true })
        .click();
      assert.equal(calls, 0);
      check("Connecting a key sends no inference request");
      await page
        .getByRole("button", { name: "Fine-tune", exact: true })
        .click();
      await page
        .getByLabel("OpenRouter model")
        .selectOption("anthropic/claude-haiku-4.5");
      await page.locator("#settings-frequency").fill("100");
      await page.getByLabel("Normal turns between detours").selectOption("2");
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "Fine-tune", exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      check("Model/frequency/cooldown controls and Escape focus restoration");
      await page
        .getByLabel("Your message", { exact: true })
        .fill("Explain the value of a constraint.");
      await page
        .getByRole("button", { name: "Send", exact: true })
        .evaluate((el) => {
          (el as HTMLButtonElement).click();
          (el as HTMLButtonElement).click();
        });
      await page
        .getByText("A useful answer, in one call.", { exact: false })
        .waitFor();
      await page.getByRole("button", { name: "Send", exact: true }).waitFor();
      assert.equal(calls, 1);
      assert.equal(await page.locator(".creative-tag").count(), 1);
      assert.equal(await page.locator(".answer-text img").count(), 0);
      assert.equal(await page.evaluate(() => "unsafe" in window), false);
      check(
        "One inference POST despite double submit; creative route; untrusted response renders as text",
      );
      await page.locator(".route-tag").click();
      await page.getByRole("dialog").waitFor();
      assert(
        await page.getByText("Decision digest", { exact: true }).isVisible(),
      );
      assert(
        await page
          .getByText("Fresh · newly observed round", { exact: true })
          .isVisible(),
      );
      await page.keyboard.press("Escape");
      check("Per-turn source and decision receipt opens");
      await page
        .getByLabel("Your message", { exact: true })
        .fill("Now give the straightforward version.");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.querySelectorAll(".answer-text").length === 2,
      );
      await page.getByRole("button", { name: "Send", exact: true }).waitFor();
      assert.equal(calls, 2);
      assert.equal(
        await page.locator(".route-tag").last().innerText(),
        "Normal route",
      );
      await page.locator(".route-tag").last().click();
      assert(
        await page
          .getByText("Reused · previously observed round", { exact: true })
          .isVisible(),
      );
      await page.keyboard.press("Escape");
      check(
        "Cooldown preserves a normal turn and cached receipt is labeled reused",
      );
      const downloadEvent = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export conversation", exact: true })
        .click();
      const download = await downloadEvent;
      const exported = await readFile((await download.path())!, "utf8");
      assert(!exported.includes(memoryNonce));
      assert.equal(JSON.parse(exported).turns.length, 2);
      assert(JSON.parse(exported).turns[0].decision.digest);
      check("JSON export includes messages and receipts, excludes key");
      assert.deepEqual(
        await page.evaluate(() => ({
          local: localStorage.length,
          session: sessionStorage.length,
          cookies: document.cookie,
        })),
        { local: 0, session: 0, cookies: "" },
      );
      check(
        "No credential or conversation storage, cookies, or console disclosure",
      );
      mode = "pending";
      await page
        .getByLabel("Your message", { exact: true })
        .fill("This request will be cancelled.");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await page.waitForFunction(() =>
        document.querySelector(".waiting")?.textContent?.includes("Waiting"),
      );
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      // Abort the intercepted socket too; nothing reaches a real provider in this suite.
      if (pending)
        await (pending as Route).abort("aborted").catch(() => undefined);
      await page
        .locator(".turn-error")
        .filter({ hasText: "Stopped. Partial text is kept." })
        .waitFor();
      await page.getByRole("button", { name: "Send", exact: true }).waitFor();
      check("Stop cancels the in-flight request");
      mode = "auth";
      await page
        .getByLabel("Your message", { exact: true })
        .fill("This request gets a provider auth error.");
      await page.keyboard.press("Enter");
      await page
        .getByRole("alert")
        .filter({ hasText: "rejected this key" })
        .waitFor();
      assert(
        !(await page
          .getByText("sensitive remote error text", { exact: false })
          .count()),
      );
      check(
        "Provider authentication error is actionable, redacted, and never retried",
      );
      const beforeCheck = calls;
      offline = true;
      await page
        .getByRole("button", { name: "Check source", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Normal mode available", exact: true })
        .waitFor();
      mode = "complete";
      await page
        .getByLabel("Your message", { exact: true })
        .fill("Answer even if the chain is unavailable.");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.querySelectorAll(".answer-text").length === 3,
      );
      await page.getByRole("button", { name: "Send", exact: true }).waitFor();
      assert.equal(calls, beforeCheck + 1);
      assert.equal(
        await page.locator(".route-tag").last().innerText(),
        "Normal route",
      );
      check(
        "Unavailable source invalidates cache and still permits one normal answer",
      );
      await page
        .getByRole("button", { name: "Explore scenes", exact: true })
        .click();
      assert.equal(await page.locator(".scene-list>button").count(), 28);
      await page.getByLabel("Browse scenes").selectOption("Creative detours");
      assert.equal(await page.locator(".scene-list>button").count(), 7);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /A borrowed idea/ })
        .click();
      assert.equal(
        await page.locator(".gallery-preview>strong").innerText(),
        "A borrowed idea",
      );
      await page.screenshot({ path: `${output}/${name}-gallery.png` });
      const galleryAudit = await new AxeBuilder({ page }).analyze();
      result.axe.gallery = galleryAudit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, checks: n.any })),
      }));
      assert.equal(
        galleryAudit.violations.length,
        0,
        JSON.stringify(result.axe.gallery),
      );
      await page.keyboard.press("Escape");
      check("All 28 gallery scenes, filtering and selection work");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(
        () =>
          (
            document.querySelector(
              'button[aria-label="Pause habitat animation"]',
            ) as HTMLButtonElement
          )?.disabled,
      );
      const frame = await page.locator(".mobile-ascii").textContent();
      await page.waitForTimeout(1500);
      assert.equal(await page.locator(".mobile-ascii").textContent(), frame);
      assert(
        await page
          .getByRole("button", { name: "Pause habitat animation", exact: true })
          .isDisabled(),
      );
      check(
        "Reduced motion freezes character animation and preserves workflow labels",
      );
      await page
        .getByRole("button", { name: "Clear chat and key", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Keep chatting", exact: true })
        .click();
      assert.equal(await page.locator(".turn").count(), 5);
      await page
        .getByRole("button", { name: "Clear chat and key", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Clear chat and key", exact: true })
        .click();
      assert.equal(await page.locator(".turn").count(), 0);
      assert(
        await page
          .getByRole("button", { name: "Add API key", exact: true })
          .isVisible(),
      );
      check(
        "Clear confirmation preserves data on cancel and clears messages/key/session on confirm",
      );
      await page
        .getByRole("button", { name: "Add API key", exact: true })
        .click();
      await page
        .getByLabel("OpenRouter API key", { exact: true })
        .fill(memoryNonce);
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Connect key", exact: true })
        .click();
      await page.reload();
      assert(
        await page
          .getByRole("button", { name: "Add API key", exact: true })
          .isVisible(),
      );
      check("Reload discards the key");
      assert(!consoleMessages.some((m) => m.includes(memoryNonce)));
      assert.equal(result.errors.length, 0);
      const social = await page.request.get(new URL("social.png", url).href);
      assert(social.ok());
      const skill = await page.request.get(
        new URL("squeek-mode-skill.zip", url).href,
      );
      assert(skill.ok());
      check("Subpath assets, social image and downloadable skill resolve");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      check(
        "200% root text enlargement reflows without horizontal page overflow (not native zoom)",
      );
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : "Browser validation failed"}\n`,
  );
  const message = error instanceof Error ? error.message : String(error);
  if (results.length) results.at(-1)!.errors.push(message);
  else
    results.push({
      browser: process.argv.includes("--webkit") ? "webkit" : "chromium",
      checks: [],
      errors: [message],
      axe: {},
    });
  process.exitCode = 1;
} finally {
  server.stop(true);
  const report = {
    checkedAt: new Date().toISOString(),
    provider: "Mocked transport only; no live inference or paid calls",
    results,
  };
  await Bun.write(
    `${output}/${process.argv.includes("--webkit") ? "webkit" : "chromium"}.json`,
    JSON.stringify(report, null, 2),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
