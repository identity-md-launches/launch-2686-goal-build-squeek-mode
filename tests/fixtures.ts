import roundJson from "./fixtures/verified-round.json";
import { CORE, DISCOVERY, ROUND_TOPIC, RPC } from "../shared/chain";
import type { Source, VerifiedRound } from "../shared/types";

export const round = roundJson as VerifiedRound;
export const verified: Source = {
  available: true,
  freshness: "fresh",
  verification: "rpc",
  round,
};
export const unavailable: Source = {
  available: false,
  reason: "unavailable",
  detail: "The source or RPC could not be reached.",
};
const hex = (v: string | number | bigint) => `0x${BigInt(v).toString(16)}`;
const word = (v: string | number | bigint) =>
  BigInt(v).toString(16).padStart(64, "0");

/** Simulated RPC responses built around an archived, genuinely verified round. Never a runtime fallback. */
export function networkFixture() {
  const log = {
    address: CORE,
    topics: [ROUND_TOPIC, `0x${word(round.roundId)}`],
    data: `0x${[round.work, round.cumulativeWork, round.cumulativeBlockUnits, round.workPerThousandBlocks].map(word).join("")}${round.dataHash.slice(2)}`,
    blockNumber: hex(round.blockNumber),
    blockHash: round.blockHash,
    transactionHash: round.transactionHash,
    logIndex: hex(round.logIndex),
    removed: false,
  };
  const event = {
    contractAddress: CORE,
    contractKind: "core",
    eventName: "RoundRecorded",
    blockNumber: round.blockNumber,
    blockHash: round.blockHash,
    blockTimestamp: String(round.blockTimestamp / 1000),
    transactionHash: round.transactionHash,
    logIndex: String(round.logIndex),
    arguments: [
      "roundId",
      "work",
      "cumulativeWork",
      "cumulativeBlockUnits",
      "workPerThousandBlocks",
      "dataHash",
    ].map((name) => ({
      name,
      value: String(round[name as keyof VerifiedRound]),
    })),
  };
  const api = {
    schemaVersion: 1,
    status: "available",
    chain: { chainId: "11155111" },
    identities: { core: CORE },
    events: [event],
  };
  const receipt = {
    status: "0x1",
    transactionHash: round.transactionHash,
    blockHash: round.blockHash,
    blockNumber: hex(round.blockNumber),
    logs: [structuredClone(log)],
  };
  const state = `0x${[round.roundId, round.cumulativeWork, round.cumulativeBlockUnits, "4118", "503463521", round.workPerThousandBlocks, "476", "0"].map(word).join("")}`;
  const rpc: Record<string, unknown> = {
    eth_chainId: "0xaa36a7",
    eth_getTransactionReceipt: receipt,
    eth_getLogs: [log],
    eth_call: state,
    eth_getCode: "0x6080604052",
  };
  const latest = {
    number: hex(BigInt(round.blockNumber) + 52n),
    timestamp: hex(Math.floor(round.verifiedAt / 1000) - 12),
  };
  const block = {
    number: hex(round.blockNumber),
    timestamp: hex(round.blockTimestamp / 1000),
    hash: round.blockHash,
  };
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    if (String(url) === DISCOVERY) return Response.json(api);
    if (String(url).replace(/\/$/, "") !== RPC)
      throw new Error("Unapproved fixture endpoint");
    const body = JSON.parse(String(init?.body));
    calls.push(body.method);
    const result =
      body.method === "eth_getBlockByNumber"
        ? body.params[0] === "latest"
          ? latest
          : block
        : rpc[body.method];
    if (result === undefined) throw new Error("Unexpected RPC method");
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  }) as typeof fetch;
  return { api, receipt, log, rpc, latest, block, fetcher, calls };
}

export const sse = (text: string, chunkSize = 7) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text);
      for (let offset = 0; offset < bytes.length; offset += chunkSize)
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      controller.close();
    },
  });
export const completion = (content: string) =>
  `: keepalive\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: { content, reasoning: "PRIVATE_REASONING_NOT_FOR_DISPLAY" } }] })}\r\n\r\ndata: {"choices":[],"usage":{"total_tokens":12}}\n\ndata: [DONE]\n\n`;
