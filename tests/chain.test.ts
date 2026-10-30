import { describe, expect, test } from "bun:test";
import {
  verifySource,
  decodeRound,
  SourceCache,
  CACHE_MS,
} from "../shared/chain";
import { networkFixture, round, unavailable, verified } from "./fixtures";
import type { Source } from "../shared/types";

describe("source verifier", () => {
  test("matches discovery to canonical receipt, complete event and latest safe log", async () => {
    const f = networkFixture();
    const s = await verifySource({ fetcher: f.fetcher, now: round.verifiedAt });
    expect(s.available).toBe(true);
    if (s.available) expect(s.round).toEqual(round);
    expect(
      f.calls.every(
        (m) =>
          m.startsWith("eth_get") || m === "eth_call" || m === "eth_chainId",
      ),
    ).toBe(true);
  });
  const corruptions: Array<
    [string, (f: ReturnType<typeof networkFixture>) => void]
  > = [
    [
      "wrong chain",
      (f) => {
        f.rpc.eth_chainId = "0x1";
      },
    ],
    [
      "wrong core",
      (f) => {
        f.api.identities.core = f.api.identities.core.toUpperCase();
      },
    ],
    [
      "failed transaction",
      (f) => {
        f.receipt.status = "0x0";
      },
    ],
    [
      "reorganized block",
      (f) => {
        f.block.hash = round.transactionHash;
      },
    ],
    [
      "wrong timestamp",
      (f) => {
        f.block.timestamp = "0x1";
      },
    ],
    [
      "mismatched data hash",
      (f) => {
        f.api.events[0].arguments[5].value = round.transactionHash;
      },
    ],
    [
      "mismatched work",
      (f) => {
        f.api.events[0].arguments[1].value = "999";
      },
    ],
    [
      "duplicate argument",
      (f) => {
        f.api.events[0].arguments.push(f.api.events[0].arguments[0]);
      },
    ],
    [
      "removed event",
      (f) => {
        f.log.removed = true;
        f.receipt.logs[0].removed = true;
      },
    ],
    [
      "wrong event signature",
      (f) => {
        f.log.topics[0] = round.dataHash;
      },
    ],
    [
      "receipt disagreement",
      (f) => {
        f.receipt.logs[0].data = "0x1234";
      },
    ],
    [
      "different latest log",
      (f) => {
        f.log.logIndex = "0x100";
      },
    ],
    [
      "empty contract code",
      (f) => {
        f.rpc.eth_getCode = "0x";
      },
    ],
    [
      "bad state encoding",
      (f) => {
        f.rpc.eth_call = "0x1234";
      },
    ],
    [
      "no active records",
      (f) => {
        f.api.events = [];
      },
    ],
    [
      "insufficient confirmations",
      (f) => {
        f.latest.number = `0x${BigInt(round.blockNumber).toString(16)}`;
      },
    ],
  ];
  test.each(corruptions)("fails closed: %s", async (_name, mutate) => {
    const f = networkFixture();
    mutate(f);
    expect(
      (await verifySource({ fetcher: f.fetcher, now: round.verifiedAt }))
        .available,
    ).toBe(false);
  });
  test("stale RPC head cannot provide entropy", async () => {
    const f = networkFixture();
    f.latest.timestamp = "0x1";
    const s = await verifySource({ fetcher: f.fetcher, now: round.verifiedAt });
    expect(s.available).toBe(false);
    if (!s.available) expect(s.reason).toBe("stale");
  });
  test("old active round is unavailable even with a current head", async () => {
    const f = networkFixture();
    f.latest.timestamp = `0x${Math.floor((round.verifiedAt + 90_000_000) / 1000).toString(16)}`;
    const s = await verifySource({
      fetcher: f.fetcher,
      now: round.verifiedAt + 90_000_000,
    });
    expect(s.available).toBe(false);
    if (!s.available) expect(s.reason).toBe("stale");
  });
  test("paused settlement selects normal fallback", async () => {
    const f = networkFixture();
    f.rpc.eth_call = String(f.rpc.eth_call).slice(0, -1) + "1";
    const s = await verifySource({ fetcher: f.fetcher, now: round.verifiedAt });
    expect(s.available).toBe(false);
    if (!s.available) expect(s.reason).toBe("paused");
  });
  test("network failure is represented without leaking remote error text", async () => {
    const s = await verifySource({
      fetcher: (async () => {
        throw new Error("PRIVATE_TRANSPORT_DATA");
      }) as unknown as typeof fetch,
    });
    expect(s.available).toBe(false);
    expect(JSON.stringify(s)).not.toContain("PRIVATE");
  });
  test("external cancellation is propagated, not converted into a model turn", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      verifySource({ signal: c.signal, fetcher: networkFixture().fetcher }),
    ).rejects.toThrow("Cancelled");
  });
  test("ABI decoder rejects width overflow and zero work", () => {
    const f = networkFixture();
    f.log.data = "0x" + "f".repeat(64) + f.log.data.slice(66);
    expect(() => decodeRound(f.log)).toThrow();
    f.log.data = "0x" + "0".repeat(64) + f.log.data.slice(66);
    expect(() => decodeRound(f.log)).toThrow();
  });
});

describe("verified-source cache", () => {
  test("labels fresh/reused, expires at 60s, and invalidates on a failed recheck", async () => {
    let now = round.verifiedAt,
      calls = 0;
    const queue: Source[] = [
      structuredClone(verified),
      structuredClone(verified),
      unavailable,
      structuredClone(verified),
    ];
    const cache = new SourceCache(
      async () => {
        calls++;
        return queue.shift()!;
      },
      () => now,
    );
    const first = await cache.get(),
      reuse = await cache.get();
    expect(first.available && first.freshness).toBe("fresh");
    expect(reuse.available && reuse.verification).toBe("cached");
    expect(calls).toBe(1);
    now += CACHE_MS;
    const rechecked = await cache.get();
    expect(rechecked.available && rechecked.freshness).toBe("reused");
    expect(calls).toBe(2);
    expect((await cache.get(true)).available).toBe(false);
    expect((await cache.get()).available).toBe(true);
    expect(calls).toBe(4);
  });
});
