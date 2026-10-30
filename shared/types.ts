export type Move =
  "invert" | "subtract" | "reframe" | "borrow" | "constrain" | "challenge";

export interface VerifiedRound {
  chainId: 11155111;
  contract: string;
  roundId: string;
  work: string;
  cumulativeWork: string;
  cumulativeBlockUnits: string;
  workPerThousandBlocks: string;
  dataHash: string;
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  blockTimestamp: number;
  logIndex: number;
  confirmations: number;
  verifiedAt: number;
  checkedThroughBlock: string;
  rpc: string;
}

export type Source =
  | {
      available: true;
      freshness: "fresh" | "reused";
      verification: "rpc" | "cached";
      round: VerifiedRound;
    }
  | {
      available: false;
      reason: "unavailable" | "timeout" | "invalid" | "stale" | "paused";
      detail: string;
    };

export interface EngineConfig {
  frequency: number;
  cooldown: number;
}
export interface EngineState {
  session: string;
  counter: number;
  lastCreative: number | null;
}
export interface Decision {
  version: "squeek-v1";
  mode: "normal" | "creative";
  move: Move | null;
  reason:
    | "source-unavailable"
    | "disabled"
    | "cooldown"
    | "normal-draw"
    | "creative-draw";
  digest: string | null;
  draw: number | null;
  source: Source;
  config: EngineConfig;
  before: EngineState;
  after: EngineState;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
