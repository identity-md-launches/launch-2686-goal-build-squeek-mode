import type { Source, VerifiedRound } from "./types";

export const CHAIN_ID = 11155111 as const;
export const CORE = "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44";
export const DISCOVERY = "https://api.squeekchain.com/v1/core";
export const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const CONFIRMATIONS = 12;
export const CACHE_MS = 60_000;
export const MAX_ROUND_AGE_MS = 24 * 60 * 60 * 1000;
// Published SqueekCore ABI: RoundRecorded(uint64,uint64,uint64,uint96,uint32,bytes32).
export const ROUND_TOPIC =
  "0x6f7efb5b00900843c192802a77e52da9f18fee1daa04089fc4bf159963c7968c";
export const STATE_SELECTOR = "0xc19d93fb";
type Fetcher = typeof fetch;
type RecordValue = Record<string, unknown>;

class VerificationError extends Error {
  constructor(public kind: "invalid" | "stale" | "paused") {
    super(kind);
  }
}
const assert = (condition: unknown): void => {
  if (!condition) throw new VerificationError("invalid");
};
const object = (v: unknown): RecordValue => {
  assert(v !== null && typeof v === "object" && !Array.isArray(v));
  return v as RecordValue;
};
const hash = (v: unknown): string => {
  assert(typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v));
  return (v as string).toLowerCase();
};
const decimal = (v: unknown): string => {
  assert(typeof v === "string" && /^(0|[1-9][0-9]{0,29})$/.test(v));
  return v as string;
};
const hexInt = (v: unknown): bigint => {
  assert(typeof v === "string" && /^0x[0-9a-f]{1,64}$/i.test(v));
  return BigInt(v as string);
};
const toHex = (n: bigint) => `0x${n.toString(16)}`;

export function decodeRound(logValue: unknown) {
  const log = object(logValue);
  assert(
    typeof log.address === "string" &&
      log.address.toLowerCase() === CORE &&
      log.removed !== true,
  );
  assert(Array.isArray(log.topics) && log.topics.length === 2);
  const topics = log.topics as unknown[];
  assert(hash(topics[0]) === ROUND_TOPIC);
  const roundId = hexInt(hash(topics[1]));
  assert(roundId > 0n && roundId < 2n ** 64n);
  assert(typeof log.data === "string" && /^0x[0-9a-f]{320}$/i.test(log.data));
  const words = (log.data as string).slice(2).match(/.{64}/g)!;
  const values = words.slice(0, 4).map((v) => BigInt(`0x${v}`));
  assert(
    values[0] > 0n &&
      values[0] < 2n ** 64n &&
      values[1] >= values[0] &&
      values[1] < 2n ** 64n,
  );
  assert(values[2] < 2n ** 96n && values[3] > 0n && values[3] < 2n ** 32n);
  return {
    roundId: String(roundId),
    work: String(values[0]),
    cumulativeWork: String(values[1]),
    cumulativeBlockUnits: String(values[2]),
    workPerThousandBlocks: String(values[3]),
    dataHash: `0x${words[4].toLowerCase()}`,
  };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error("Network unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2_000_000) throw new VerificationError("invalid");
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function verifySource(
  options: {
    fetcher?: Fetcher;
    now?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<Source> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 6500);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let id = 0;
  const rpc = async (method: string, params: unknown[]) => {
    const requestId = ++id;
    const body = object(
      await readJson(
        await fetcher(RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            method,
            params,
          }),
          signal,
          credentials: "omit",
          redirect: "error",
        }),
      ),
    );
    assert(body.id === requestId && body.jsonrpc === "2.0");
    if (body.error) throw new Error("RPC unavailable");
    return body.result;
  };
  try {
    const [apiValue, chainId, latestValue] = await Promise.all([
      fetcher(DISCOVERY, {
        signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      }).then(readJson),
      rpc("eth_chainId", []),
      rpc("eth_getBlockByNumber", ["latest", false]),
    ]);
    const api = object(apiValue),
      latest = object(latestValue);
    assert(hexInt(chainId) === BigInt(CHAIN_ID));
    assert(api.schemaVersion === 1 && api.status === "available");
    assert(
      decimal(object(api.chain).chainId) === String(CHAIN_ID) &&
        object(api.identities).core === CORE,
    );
    const latestTimestamp = Number(hexInt(latest.timestamp)) * 1000;
    if (now - latestTimestamp > 180_000 || latestTimestamp - now > 60_000)
      throw new VerificationError("stale");
    const head = hexInt(latest.number),
      safe = head - BigInt(CONFIRMATIONS) + 1n;
    assert(safe > 0n && Array.isArray(api.events));
    const candidates = (api.events as unknown[])
      .map(object)
      .filter(
        (e) =>
          e.eventName === "RoundRecorded" &&
          BigInt(decimal(e.blockNumber)) <= safe,
      )
      .sort(
        (a, b) =>
          Number(
            BigInt(decimal(b.blockNumber)) - BigInt(decimal(a.blockNumber)),
          ) || Number(decimal(b.logIndex)) - Number(decimal(a.logIndex)),
      );
    assert(candidates.length > 0);
    const candidate = candidates[0];
    assert(
      candidate.contractAddress === CORE && candidate.contractKind === "core",
    );
    const blockNumber = BigInt(decimal(candidate.blockNumber));
    const age = now - Number(decimal(candidate.blockTimestamp)) * 1000;
    if (age > MAX_ROUND_AGE_MS || age < -60_000 || safe - blockNumber > 8000n)
      throw new VerificationError("stale");
    const tx = hash(candidate.transactionHash),
      blockHash = hash(candidate.blockHash);
    const [receiptValue, blockValue, logsValue, stateValue, code] =
      await Promise.all([
        rpc("eth_getTransactionReceipt", [tx]),
        rpc("eth_getBlockByNumber", [toHex(blockNumber), false]),
        rpc("eth_getLogs", [
          {
            address: CORE,
            fromBlock: toHex(blockNumber),
            toBlock: toHex(safe),
            topics: [ROUND_TOPIC],
          },
        ]),
        rpc("eth_call", [{ to: CORE, data: STATE_SELECTOR }, toHex(safe)]),
        rpc("eth_getCode", [CORE, toHex(safe)]),
      ]);
    const receipt = object(receiptValue),
      block = object(blockValue);
    assert(
      receipt.status === "0x1" &&
        hash(receipt.transactionHash) === tx &&
        hash(receipt.blockHash) === blockHash,
    );
    assert(
      hexInt(receipt.blockNumber) === blockNumber &&
        hexInt(block.number) === blockNumber &&
        hash(block.hash) === blockHash,
    );
    assert(
      String(hexInt(block.timestamp)) === decimal(candidate.blockTimestamp),
    );
    assert(
      typeof code === "string" &&
        /^0x[0-9a-f]+$/i.test(code) &&
        code.length > 4,
    );
    assert(
      typeof stateValue === "string" && /^0x[0-9a-f]{512}$/i.test(stateValue),
    );
    const state = (stateValue as string)
      .slice(2)
      .match(/.{64}/g)!
      .map((v) => BigInt(`0x${v}`));
    assert(state[7] === 0n || state[7] === 1n);
    if (state[7] === 1n) throw new VerificationError("paused");
    assert(Array.isArray(logsValue) && logsValue.length > 0);
    const logs = (logsValue as unknown[])
      .map(object)
      .sort(
        (a, b) =>
          Number(hexInt(b.blockNumber) - hexInt(a.blockNumber)) ||
          Number(hexInt(b.logIndex) - hexInt(a.logIndex)),
      );
    const log = logs[0];
    assert(
      hash(log.transactionHash) === tx &&
        hash(log.blockHash) === blockHash &&
        hexInt(log.blockNumber) === blockNumber,
    );
    assert(String(hexInt(log.logIndex)) === decimal(candidate.logIndex));
    assert(Array.isArray(receipt.logs));
    const inReceipt = (receipt.logs as unknown[])
      .map(object)
      .find((l) => hexInt(l.logIndex) === hexInt(log.logIndex));
    assert(
      inReceipt &&
        inReceipt.address === log.address &&
        inReceipt.data === log.data &&
        JSON.stringify(inReceipt.topics) === JSON.stringify(log.topics),
    );
    const decoded = decodeRound(log);
    assert(
      state[0] >= BigInt(decoded.roundId) &&
        state[1] >= BigInt(decoded.cumulativeWork),
    );
    assert(Array.isArray(candidate.arguments));
    const args = (candidate.arguments as unknown[]).map(object);
    for (const [key, value] of Object.entries(decoded)) {
      const matches = args.filter((a) => a.name === key);
      assert(matches.length === 1 && matches[0].value === value);
    }
    const round: VerifiedRound = {
      chainId: CHAIN_ID,
      contract: CORE,
      ...decoded,
      transactionHash: tx,
      blockHash,
      blockNumber: String(blockNumber),
      blockTimestamp: Number(hexInt(block.timestamp)) * 1000,
      logIndex: Number(hexInt(log.logIndex)),
      confirmations: Number(head - blockNumber + 1n),
      verifiedAt: now,
      checkedThroughBlock: String(safe),
      rpc: RPC,
    };
    return { available: true, freshness: "fresh", verification: "rpc", round };
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Cancelled", "AbortError");
    const reason = timeout.aborted
      ? "timeout"
      : error instanceof VerificationError
        ? error.kind
        : "unavailable";
    const detail = {
      invalid: "Source records did not match the pinned contract and RPC.",
      stale: "The latest verified activity is too old.",
      paused: "Squeekchain settlement is paused.",
      timeout: "Source verification timed out.",
      unavailable: "The source or RPC could not be reached.",
    }[reason];
    return { available: false, reason, detail };
  }
}

export class SourceCache {
  private cached: Source | null = null;
  private previousId = "";
  constructor(
    private verifier = verifySource,
    private clock = Date.now,
  ) {}
  async get(force = false, signal?: AbortSignal): Promise<Source> {
    if (
      !force &&
      this.cached?.available &&
      this.clock() >= this.cached.round.verifiedAt &&
      this.clock() - this.cached.round.verifiedAt < CACHE_MS
    ) {
      return { ...this.cached, freshness: "reused", verification: "cached" };
    }
    const source = await this.verifier({ signal });
    if (source.available) {
      const id = `${source.round.transactionHash}:${source.round.logIndex}`;
      source.freshness = id === this.previousId ? "reused" : "fresh";
      this.previousId = id;
    }
    // A failed recheck invalidates the cache. Never fall back to old entropy after a failure.
    this.cached = source;
    return source;
  }
}
