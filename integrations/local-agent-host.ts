import { parseArgs } from "node:util";
import { decide, guidance } from "../shared/engine";
import { verifySource } from "../shared/chain";
import { streamChat } from "../shared/provider";
import type { EngineConfig, EngineState, Source } from "../shared/types";
import { parseSettings } from "../skill/squeek-mode/scripts/squeek";

export async function prepareTurn(
  prompt: string,
  state: EngineState,
  config: EngineConfig,
  source?: Source,
) {
  if (!prompt.trim() || prompt.length > 12000)
    throw new Error("Task must contain 1–12,000 characters.");
  const decision = await decide(
    source ?? (await verifySource()),
    state,
    config,
  );
  return {
    schemaVersion: 1,
    decision,
    nextState: decision.after,
    instruction: guidance(decision),
    messages: [{ role: "user" as const, content: prompt.trim() }],
  };
}

export async function runTurn(
  envelope: Awaited<ReturnType<typeof prepareTurn>>,
  options: {
    key: string;
    model: string;
    signal: AbortSignal;
    onText: (text: string) => void;
    fetcher?: typeof fetch;
  },
) {
  return streamChat({
    ...options,
    instruction: envelope.instruction,
    messages: envelope.messages,
  });
}

async function readHiddenKey(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error("Live mode requires an interactive terminal.");
  process.stderr.write("OpenRouter key (hidden; sending uses credits): ");
  const input = process.stdin;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let key = "";
    const finish = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      process.stderr.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          finish();
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          const result = key;
          key = "";
          finish();
          resolve(result);
          return;
        }
        if (char === "\u007f" || char === "\b") key = key.slice(0, -1);
        else if (char.charCodeAt(0) >= 32 && key.length < 1024) key += char;
      }
    };
    input.on("data", onData);
  });
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      strict: true,
      options: {
        "prompt-file": { type: "string" },
        send: { type: "boolean" },
        model: { type: "string", default: "openai/gpt-4.1-mini" },
        session: { type: "string" },
        counter: { type: "string" },
        "last-creative": { type: "string" },
        frequency: { type: "string" },
        cooldown: { type: "string" },
      },
    });
    if (!values["prompt-file"]) throw new Error("Supply --prompt-file.");
    const settingsArgs = [
      "session",
      "counter",
      "last-creative",
      "frequency",
      "cooldown",
    ].flatMap((name) => {
      const v = values[name as keyof typeof values];
      return typeof v === "string" ? [`--${name}`, v] : [];
    });
    const settings = parseSettings(settingsArgs);
    const file = Bun.file(values["prompt-file"]);
    if (file.size > 48_000) throw new Error("Task file is too large.");
    const envelope = await prepareTurn(
      await file.text(),
      settings.state,
      settings.config,
    );
    if (!values.send)
      process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    else {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.once("SIGINT", cancel);
      let key = await readHiddenKey();
      if (!key.trim() || /\s/.test(key)) throw new Error("Invalid key input.");
      try {
        await runTurn(envelope, {
          key,
          model: values.model!,
          signal: controller.signal,
          onText: (text) => process.stdout.write(text),
        });
      } finally {
        key = "";
        process.removeListener("SIGINT", cancel);
      }
      process.stdout.write("\n");
      process.stderr.write(`Receipt: ${JSON.stringify(envelope.decision)}\n`);
    }
  } catch {
    process.stderr.write(
      "Host stopped. Check the task file, settings, network, and provider account. No request is retried automatically.\n",
    );
    process.exitCode = 2;
  }
}
