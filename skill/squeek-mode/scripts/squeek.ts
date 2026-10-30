import { parseArgs } from "node:util";
import { decide, guidance, validateState } from "../../../shared/engine";
import { verifySource } from "../../../shared/chain";
import type { EngineConfig, EngineState } from "../../../shared/types";

export function parseSettings(args: string[]) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      session: { type: "string" },
      counter: { type: "string", default: "0" },
      "last-creative": { type: "string" },
      frequency: { type: "string", default: "20" },
      cooldown: { type: "string", default: "2" },
      "previous-source": { type: "string" },
      json: { type: "boolean" },
      plain: { type: "boolean" },
    },
  });
  const state: EngineState = {
    session: values.session ?? crypto.randomUUID(),
    counter: Number(values.counter),
    lastCreative:
      values["last-creative"] === undefined
        ? null
        : Number(values["last-creative"]),
  };
  const config: EngineConfig = {
    frequency: Number(values.frequency),
    cooldown: Number(values.cooldown),
  };
  validateState(state, config);
  if (values.json && values.plain) throw new Error("Choose one output format.");
  if (
    values["previous-source"] &&
    !/^0x[0-9a-f]{64}:\d+$/i.test(values["previous-source"])
  )
    throw new Error("Invalid previous source identifier.");
  return {
    state,
    config,
    plain: values.plain,
    previousSource: values["previous-source"],
  };
}

export async function runHelper(args: string[]) {
  const { state, config, plain, previousSource } = parseSettings(args);
  const source = await verifySource();
  if (
    source.available &&
    `${source.round.transactionHash}:${source.round.logIndex}` ===
      previousSource?.toLowerCase()
  )
    source.freshness = "reused";
  const decision = await decide(source, state, config);
  const result = {
    schemaVersion: 1,
    verification: "live-check",
    decision,
    guidance: guidance(decision),
  };
  return plain
    ? [
        `Squeek Mode: ${decision.mode}${decision.move ? ` / ${decision.move}` : ""}`,
        `Session: ${state.session} · Turn: ${decision.after.counter} · Reason: ${decision.reason}`,
        source.available
          ? `Source: ${source.freshness}; Sepolia round ${source.round.roundId}; block ${source.round.blockNumber}; tx ${source.round.transactionHash}; log ${source.round.logIndex}`
          : `Source unavailable: ${source.detail}`,
        `Next state: ${JSON.stringify(decision.after)}`,
        `Receipt: ${JSON.stringify(decision)}`,
        result.guidance,
      ].join("\n")
    : JSON.stringify(result, null, 2);
}

if (import.meta.main) {
  try {
    process.stdout.write(`${await runHelper(process.argv.slice(2))}\n`);
  } catch {
    process.stderr.write(
      "Invalid helper input. Check session, counter, frequency, cooldown, last creative turn, and output flags.\n",
    );
    process.exitCode = 2;
  }
}
