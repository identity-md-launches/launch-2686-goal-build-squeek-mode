# Squeek Mode

A static BYOK chat workbench with an animated ASCII hamster habitat and occasional, reproducible creative approaches. Built with Bun, TypeScript and React. The website and portable skill share the same engine.

The usable production export is included in `dist/`. It includes local fonts, the social image, favicon, and downloadable skill ZIP. Asset URLs are relative, so the export works at a static-hosting subpath. No backend, wallet, gas, relay, account registration, or deployment is required to preview it.

## Preview the included export

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://localhost:4173`. Serve through localhost or HTTPS; opening `index.html` as a `file:` URL is not supported. Chat needs an OpenRouter key, but the interface, gallery and free chain checks work without one.

## Install, develop and rebuild

Use Bun 1.4.4 (the lockfile was generated with that version), and a modern Chromium or WebKit browser.

```sh
bun install --frozen-lockfile
bun run dev
```

To check and rebuild:

```sh
bun run typecheck
bun test tests
bun run build
bun run preview
```

The build writes `dist/`, regenerates the standalone skill executables, and packages `dist/squeek-mode-skill.zip`. The social PNG is already included; `bun run social` regenerates it from the source SVG using Playwright Chromium. It is not a required build-time download.

For the browser suites, install Playwright browsers and their OS dependencies on a machine where you may do so:

```sh
bunx playwright install --with-deps chromium webkit
bun run test:browser
bun run test:browser:webkit
```

The browser script serves the actual production export under `/preview/`, isolates network requests, runs interactions and axe checks, and stops its server when finished. It writes evidence to `test/scratch/browser-validation/`. The inference responses in these suites are explicitly mocked; the scripts never send a real API key or make a paid request. A real source check is separate:

```sh
bun run verify:chain
```

No dependencies, caches, temporary browser downloads, or vendored registries are included in this submission. Validation dependencies were installed in a temporary workspace. Do not add `node_modules/` or generated caches to a submission. No ignore file was changed.

## Using chat

1. Choose **Add API key**, or **Start chatting**. Paste an OpenRouter key into the password field and acknowledge that sending messages can spend provider credits. Connecting the key makes no inference call. Set a credit limit for the key in OpenRouter.
2. Write a message or choose a starter. **Send** makes one browser-direct streaming POST to OpenRouter, with automatic retries and provider fallback disabled. Enter sends; Shift+Enter inserts a line break.
3. **Fine-tune** changes the model, creative frequency and cooldown. Frequency defaults to 20% on eligible turns, with two normal turns after every creative turn. Output is limited to 2,048 tokens, which is not a monetary spending cap.
4. **Stop** aborts the local request and keeps partial text. Failed/cancelled turns are visibly marked and excluded from later model context. Providers may continue billing after a cancellation depending on their support.
5. **Export** downloads conversation text, model selections and full receipts as JSON. The credential field is never exported. **Clear chat and key** asks for confirmation, aborts work and resets the conversation, key and local session. Reloading also loses the memory-only key and chat.

The app never writes credentials or conversation content to local/session storage, IndexedDB, cookies, URLs, logs, or a service worker. OpenRouter and the selected model provider receive the conversation text when you send it. Responses are rendered as plain text, including any HTML or Markdown returned by a model. No model-selected tools or external actions execute.

## How a route is selected

`shared/engine.ts` defines algorithm `squeek-v1`. A fixed JSON array combines the verified chain/contract, active-round values, data hash, transaction and block hashes, block/log position, local session identifier and next turn counter. SHA-256 gives a deterministic draw and one of six moves: invert, subtract, reframe, borrow, constrain or challenge.

Cooldown takes priority over the frequency draw. A cooldown of two means that turns immediately following a creative turn are normal, normal, then eligible. Unavailable source always means normal mode. Frequency is not a guarantee that a fixed fraction of all turns will be creative. A selected approach remains optional if it does not help the original goal.

Permissions and external actions are not engine inputs or outputs. Guidance preserves user goals, safety and approval requirements. This is public, reproducible variety, **not security-grade randomness**.

## Source verification

The pinned network is Ethereum Sepolia, chain ID `11155111`, core `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`.

- Discovery: [Squeekchain core API](https://api.squeekchain.com/v1/core).
- Read-only RPC: `https://ethereum-sepolia-rpc.publicnode.com`.
- Event decoding follows the published [SqueekCore ABI](https://docs.squeekchain.com/assets/abi/SqueekCore.json) and [indexing documentation](https://docs.squeekchain.com/developers/index-events/). The docs show another deployment; the implementation deliberately retains the contract supplied in this assignment.

Verification checks the chain ID, pinned core identity, nonempty bytecode, successful transaction receipt, canonical block hash/timestamp, complete event data, log position, current unpaused state and latest active event through a block with at least 12 confirmations. A live head older than three minutes, a round older than 24 hours, a mismatch, or an unavailable service selects normal mode. A check is bounded to 6.5 seconds in chat.

“Fresh” means newly observed by this tab; “reused” means the same verified round was already seen. A browser verification may be cached for at most 60 seconds. A failed recheck invalidates it. Receipts distinguish a new RPC verification from a cached check, and retain the full source and decision inputs. The helper checks RPC on each invocation and can accept a prior source identifier for reused labeling.

This verifies records through one RPC, not a cryptographic light client or physical hamster activity. It trusts that RPC and the contract/reporter/governance. A proxy upgrade or reorganization may invalidate previous assumptions. `dataHash` commits to records; it does not prove their real-world cause.

## Habitat and skill

The habitat has 28 distinct character scenes spanning idle, source checks, normal travel, six creative moves, response streaming, return, sleep, cancellation and errors. State labels describe observable application work. The animation does not represent private model thoughts and never gates network requests or answer rendering. A gallery lets you inspect scenes without pretending those previews are live events.

Animation can be paused and respects reduced motion. Sound is off by default; enabling it adds brief synthesized cues for completion/error/cancellation. The narrow layout uses a smaller character canvas and places chat before the habitat.

The skill source is [skill/squeek-mode/SKILL.md](skill/squeek-mode/SKILL.md). Installation and the tested local host are documented in [INSTALL.md](skill/squeek-mode/INSTALL.md). Download the complete standalone package from the site or use `dist/squeek-mode-skill.zip`.

The included Bun reference host integration was tested with the shared engine, simulated provider streaming, and a real-chain request-envelope run from the extracted archive. It supports an explicitly invoked `--send` mode with hidden terminal key input. That live provider path was not exercised with a real key. No compatibility claim is made for Codex, Claude Code or any other untested host; no existing profile was changed.

## Validation and limits

Actual results are recorded in [artifacts/validation.md](artifacts/validation.md), with machine-readable chain, browser, dependency-audit and independent automated security-scan evidence. The implemented design is documented in [DESIGN.md](DESIGN.md). The security review and its limits are in [artifacts/security-review.md](artifacts/security-review.md).

- Production build and TypeScript check pass.
- 59 unit/integration tests pass, including deterministic replay of a real receipt, adversarial source data, stream boundaries, cancellation, and the local agent host.
- Chromium and WebKit interaction suites pass 19 checks each. Axe reports no violations in the initial page, key dialog and gallery. These are not screen-reader or physical-device tests.
- The pinned taste@1 probe passes 16/16 checks. The product and main action are visible in the first 390px screen.
- A real Sepolia round and browser CORS requests were verified. Full receipts are in `artifacts/`.
- No paid inference was executed: the approved spending cap remains $0 and no provider credential was supplied. The authorized live provider test remains pending. See [artifacts/provider-test.md](artifacts/provider-test.md) for the concrete procedure and evidence distinction.
- Independent automated checks use external Semgrep rules and the dependency advisory database. No independent human or second-agent audit was available; this limitation is explicit in the security review.

The earlier milestone/budget proposal is recorded in [artifacts/milestones.md](artifacts/milestones.md). “Hamster AI Backrooms” multi-agent rooms are deferred to phase 2. Nothing was purchased, publicly deployed, posted, or installed into an existing agent profile.

## Sources and attribution

OpenRouter integration follows its [streaming documentation](https://openrouter.ai/docs/api/reference/streaming). CORS was measured against the endpoint before implementation; current provider behavior can change.

Design guidance: Jakub Krehel’s Better Interface, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Documentation method: Paul Bakaus’s Impeccable, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). Both licenses are retained in `licenses/Better-Interface-LICENSE.txt`. DM Sans is bundled under the SIL Open Font License; React and React DOM are MIT. Runtime notices are included in `dist/licenses.txt`.
