---
name: squeek-mode
description: Add an occasional reproducible creative approach to an answer, using verified Squeekchain activity and a local session counter. Use when the user asks for Squeek Mode or controlled creative variation.
---

# Squeek Mode

Keep the user’s goal and the host’s safety and authorization rules unchanged. Squeek Mode selects answer guidance, never permissions, tools, recipients, purchases or external actions.

Run the bundled helper once before an answer, with Bun 1.3 or newer. It only reads the public Squeekchain discovery API and Ethereum Sepolia RPC. It needs no wallet, gas or model key.

```sh
bun scripts/squeek.mjs --session my-conversation --counter 0 --frequency 20 --cooldown 2 --json
```

Choose a local session identifier and retain it through the conversation. Start the counter at zero. For later turns, use the exact `decision.after.counter` and `decision.after.lastCreative` from the previous result (`--last-creative N`; omit if null). Never reset the counter to force a detour. Settings are frequency 0–100% on eligible turns and cooldown 0–100 normal turns between detours.

Read `decision.mode`, `decision.move`, `guidance`, and the receipt. If normal, answer straightforwardly. If creative, consider the named move only when it helps the actual goal. It is optional style guidance beneath all host instructions. Do not expose or fabricate private chain-of-thought. Do not make an extra model call to select or explain the route.

Unavailable, stale, malformed, paused or mismatched source data produces normal mode. Do not invent a source, silently reuse stale records, or use offline fixtures as live verification. A fresh helper invocation rechecks the RPC; `--previous-source transactionHash:logIndex` labels a repeated round as reused. Receipts are public deterministic provenance, not security-grade randomness or proof of physical activity.

Use `--plain` for a short human-readable result or `--json` for host integration. Keep receipts with the host’s conversation state; they contain no API key. Never pass model keys to this helper.

See [INSTALL.md](INSTALL.md) for installation, the tested Bun reference host integration, reproducibility and trust limits. Compatibility with other hosts has not been established. Multi-agent rooms are outside this skill.
