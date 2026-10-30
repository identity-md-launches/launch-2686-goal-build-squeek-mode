import { expect, test } from "bun:test";
import { prepareTurn, runTurn } from "../integrations/local-agent-host";
import { parseSettings } from "../skill/squeek-mode/scripts/squeek";
import { decide } from "../shared/engine";
import { completion, sse, unavailable, verified } from "./fixtures";
import { SCENES, habitatFrame, workflowScenes } from "../src/scenes";
import { zip } from "../scripts/package-skill";

test("local Bun host integrates the same engine and one-call provider boundary", async () => {
  const state = { session: "host-integration", counter: 0, lastCreative: null },
    config = { frequency: 100, cooldown: 2 };
  const envelope = await prepareTurn(
    "Explain photosynthesis in one paragraph.",
    state,
    config,
    verified,
  );
  expect(envelope.decision).toEqual(await decide(verified, state, config));
  expect(envelope.messages[0].content).toContain("photosynthesis");
  let calls = 0,
    output = "";
  await runTurn(envelope, {
    key: "",
    model: "openai/gpt-4.1-mini",
    signal: new AbortController().signal,
    onText: (t) => {
      output += t;
    },
    fetcher: (async (_url: unknown, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toBe(envelope.instruction);
      expect(body.messages[1].content).toBe(envelope.messages[0].content);
      return new Response(
        sse(completion("Plants turn light into stored energy.")),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch,
  });
  expect(calls).toBe(1);
  expect(output).toBe("Plants turn light into stored energy.");
});
test("host uses normal mode when the source is unavailable", async () => {
  const envelope = await prepareTurn(
    "Summarize this.",
    { session: "host-fallback", counter: 0, lastCreative: null },
    { frequency: 100, cooldown: 0 },
    unavailable,
  );
  expect(envelope.decision.mode).toBe("normal");
  expect(envelope.instruction).not.toContain("Optional approach");
});
test("host rejects an empty task before provider work", async () => {
  await expect(
    prepareTurn(
      "",
      { session: "host", counter: 0, lastCreative: null },
      { frequency: 20, cooldown: 2 },
      unavailable,
    ),
  ).rejects.toThrow();
});
test("helper validates flags and exposes JSON/plain settings", () => {
  expect(
    parseSettings([
      "--session",
      "cli",
      "--counter",
      "3",
      "--last-creative",
      "1",
      "--plain",
    ]).plain,
  ).toBe(true);
  expect(() => parseSettings(["--counter", "-1"])).toThrow();
  expect(() => parseSettings(["--json", "--plain"])).toThrow();
  expect(() => parseSettings(["--arbitrary-command", "run"])).toThrow();
});
test("all 28 scenes are distinct and fit both character canvases", () => {
  expect(SCENES.length).toBeGreaterThanOrEqual(24);
  expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  expect(new Set(SCENES.map((s) => habitatFrame(s, 0))).size).toBe(
    SCENES.length,
  );
  for (const scene of SCENES) {
    expect(
      habitatFrame(scene, 0)
        .split("\n")
        .every((row) => row.length <= 68),
    ).toBe(true);
    expect(
      habitatFrame(scene, 0, true)
        .split("\n")
        .every((row) => row.length <= 44),
    ).toBe(true);
  }
  expect(workflowScenes("error", null, false, false)).toEqual(["error"]);
  expect(workflowScenes("creative", "borrow", false, false)).toEqual([
    "borrow",
  ]);
});
test("download package has valid ZIP headers and entry names", () => {
  const archive = zip([
    { name: "SKILL.md", data: new TextEncoder().encode("Skill") },
  ]);
  expect(
    new DataView(archive.buffer, archive.byteOffset).getUint32(0, true),
  ).toBe(0x04034b50);
  expect(new TextDecoder().decode(archive)).toContain("SKILL.md");
});
