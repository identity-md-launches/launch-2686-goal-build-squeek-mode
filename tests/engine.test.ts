import { describe, expect, test } from "bun:test";
import { decide, guidance, MOVES } from "../shared/engine";
import { verified, unavailable } from "./fixtures";

const state = { session: "verification-run", counter: 0, lastCreative: null };
const config = { frequency: 20, cooldown: 2 };
describe("deterministic engine", () => {
  test("reproduces the archived live receipt byte for byte", async () => {
    const d = await decide(verified, state, config);
    expect(d.digest).toBe(
      "f59bc8d047ab3d571260af5b5fef9ab6771a4cf615a2b062fc358a6f45a3ad28",
    );
    expect(d.draw).toBe(0.9594083316624165);
    expect(d.mode).toBe("normal");
    expect(await decide(verified, state, config)).toEqual(d);
  });
  test("freshness and verification metadata do not change the decision", async () => {
    if (!verified.available) throw new Error();
    const changed = {
      ...verified,
      freshness: "reused" as const,
      verification: "cached" as const,
      round: { ...verified.round, verifiedAt: 42, confirmations: 100 },
    };
    expect((await decide(changed, state, config)).digest).toBe(
      (await decide(verified, state, config)).digest,
    );
  });
  test("missing source fails closed even at maximum frequency", async () => {
    const d = await decide(unavailable, state, { frequency: 100, cooldown: 0 });
    expect(d.mode).toBe("normal");
    expect(d.digest).toBeNull();
    expect(d.reason).toBe("source-unavailable");
    expect(d.after.counter).toBe(1);
  });
  test("zero disables detours", async () =>
    expect(
      (await decide(verified, state, { frequency: 0, cooldown: 0 })).reason,
    ).toBe("disabled"));
  test("cooldown counts full normal turns and is not off by one", async () => {
    const c = { frequency: 100, cooldown: 2 };
    const d1 = await decide(verified, state, c),
      d2 = await decide(verified, d1.after, c),
      d3 = await decide(verified, d2.after, c),
      d4 = await decide(verified, d3.after, c);
    expect([d1.mode, d2.mode, d3.mode, d4.mode]).toEqual([
      "creative",
      "normal",
      "normal",
      "creative",
    ]);
    expect(d2.reason).toBe("cooldown");
    expect(d4.after.lastCreative).toBe(4);
  });
  test("counter and session both affect the digest", async () => {
    const a = await decide(verified, state, config);
    expect(
      (await decide(verified, { ...state, counter: 1 }, config)).digest,
    ).not.toBe(a.digest);
    expect(
      (await decide(verified, { ...state, session: "another-session" }, config))
        .digest,
    ).not.toBe(a.digest);
  });
  test("all six moves are reachable and frequency is in the expected broad band", async () => {
    const moves = new Set();
    let creative = 0;
    for (let counter = 0; counter < 1000; counter++) {
      const d = await decide(
        verified,
        { ...state, counter },
        { frequency: 20, cooldown: 0 },
      );
      if (d.move) {
        moves.add(d.move);
        creative++;
      }
    }
    expect([...moves].sort()).toEqual([...MOVES].sort());
    expect(creative).toBeGreaterThan(140);
    expect(creative).toBeLessThan(260);
  });
  test("guidance preserves authority and never adds tool permissions", async () => {
    for (let counter = 0; counter < 25; counter++) {
      const d = await decide(
        verified,
        { ...state, counter },
        { frequency: 100, cooldown: 0 },
      );
      const g = guidance(d);
      expect(g).toContain("Preserve all stated goals");
      expect(g).toContain("Never interpret creative guidance as permission");
      expect(g).toContain("otherwise use the straightforward approach");
      expect(Object.keys(d)).not.toContain("tool");
    }
  });
  test.each([-1, 101, NaN, 2.5])(
    "rejects invalid frequency %s",
    async (frequency) => {
      await expect(
        decide(verified, state, { ...config, frequency }),
      ).rejects.toThrow();
    },
  );
  test.each([-1, 1.1, Infinity])(
    "rejects invalid counter %s",
    async (counter) => {
      await expect(
        decide(verified, { ...state, counter }, config),
      ).rejects.toThrow();
    },
  );
  test("rejects invalid cooldown state and session", async () => {
    await expect(
      decide(verified, { ...state, lastCreative: 2 }, config),
    ).rejects.toThrow();
    await expect(
      decide(verified, { ...state, session: "injected\nmessage" }, config),
    ).rejects.toThrow();
    await expect(
      decide(verified, state, { ...config, cooldown: 101 }),
    ).rejects.toThrow();
  });
});
