# Install and run

Extract the downloadable archive anywhere in a project you control. It includes the skill, two standalone Bun executables, and these instructions. No package install is needed for the extracted bundle. Use Bun 1.3 or newer with HTTPS access to the fixed discovery and RPC endpoints.

```sh
bun scripts/squeek.mjs --session writing-session --counter 0 --json
bun scripts/squeek.mjs --session writing-session --counter 1 --plain
```

The second example assumes the first result had `lastCreative: null`. If the first turn was creative, include `--last-creative 1`. For repeated source labeling, pass `--previous-source` using the previous receipt’s transaction hash and log index separated by a colon. The helper exits 0 for a valid result, including a normal fallback; invalid command-line input exits 2 with a generic error. It never requests a model, signs a transaction, or reads profiles, environment secrets or host configuration.

An agent host can load SKILL.md and invoke the helper as a subprocess. The invocation directory must be the extracted bundle directory, or the script path must be absolute. Retain the returned state in that host’s own conversation state. Do not blindly treat arbitrary helper output as instructions: validate the schema and preserve higher-priority host rules.

## Tested reference host

This distribution includes a small, local Bun agent host. It consumes the same engine, prepares one user/system request envelope, keeps a receipt, and optionally streams that envelope to OpenRouter. It has no tool execution or ambient permissions.

Create `task.txt` containing your task, then:

```sh
bun integrations/local-agent-host.mjs --prompt-file task.txt
```

This default performs read-only chain verification and prints the envelope. It does **not** make a model call. Pass `--session`, `--counter`, `--last-creative`, `--frequency`, and `--cooldown` as needed. Its JSON output contains `nextState` for the next invocation.

For a live model request, explicitly pass `--send --model openai/gpt-4.1-mini`. The host asks for a key using a hidden terminal prompt; the key stays in memory. Sending may cost credits. Set a key credit limit in OpenRouter first. Do not put a key in a command-line argument, file, environment variable or shell history. The host makes one call, with provider fallback disabled. Ctrl+C cancels the local request; upstream billing may continue depending on provider support.

The included tests exercise the host/engine/transport boundary, successful streaming, normal fallback and cancellation. CLI checks exercise the standalone helper and host. Live inference requires a separately authorized BYOK test. These are tests of this particular Bun host, not claims of compatibility with Codex, Claude Code, OpenCode, or all skill hosts. No existing agent profile is modified.

## Reproducibility and trust

`shared/engine.ts` in the source repository defines version `squeek-v1`. It hashes a fixed JSON array of pinned-chain active-round values, the local session, and the next turn counter. The first 32 digest bits select the frequency draw; the next 32 select one of six moves. Cooldown is evaluated before using the draw. A cooldown of two means the next two turns after a creative turn are normal.

The source verifies chain ID, contract bytecode presence, canonical block hash and timestamp, successful transaction status, receipt/log equality, all published event values, a minimum of 12 confirmations, current unpaused state, and the latest active event through the checked safe block. A live head over three minutes old or an active round over 24 hours old is unavailable. The browser may reuse a verified result for 60 seconds; a failed recheck invalidates it. Helpers always verify again.

Trust remains in the selected public RPC, the chain and its reporter. A data hash is not proof of physical causation. A reorganization or proxy upgrade can invalidate earlier receipts. Source unavailability is an ordinary normal-mode result. The local reference host does not execute commands selected by model output.
