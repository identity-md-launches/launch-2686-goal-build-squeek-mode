import { useEffect, useRef, useState, type FormEvent } from "react";
import { decide, guidance, MOVE_INFO } from "../shared/engine";
import { SourceCache } from "../shared/chain";
import { ProviderError, streamChat } from "../shared/provider";
import type {
  Decision,
  EngineConfig,
  EngineState,
  Source,
} from "../shared/types";
import { Habitat, Gallery } from "./Habitat";
import { Icon } from "./icons";
import { Modal } from "./Modal";
import { Receipt } from "./Receipt";
import type { Phase } from "./scenes";

type Turn = {
  id: string;
  prompt: string;
  answer: string;
  status: "pending" | "complete" | "cancelled" | "error";
  decision: Decision | null;
  model: string;
  error?: string;
};
type Panel =
  "key" | "settings" | "gallery" | "skill" | "receipt" | "clear" | null;
const MODELS = [
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
];
const newSession = (): EngineState => ({
  session: crypto.randomUUID(),
  counter: 0,
  lastCreative: null,
});
const suggestions = [
  "Simplify a big idea",
  "Find a fresh angle",
  "Make a practical plan",
];
const prompts = [
  "Help me explain a complex idea simply. Ask me what the idea is.",
  "Help me find a fresh angle on a project. Ask me about the project and its goal.",
  "Help me make a practical plan. Ask me what I want to achieve and my constraints.",
];
const sourceCache = new SourceCache();

export function App() {
  const [key, setKey] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [model, setModel] = useState(MODELS[0].id);
  const [config, setConfig] = useState<EngineConfig>({
    frequency: 20,
    cooldown: 2,
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [receiptTurn, setReceiptTurn] = useState<Decision | null>(null);
  const state = useRef(newSession());
  const controller = useRef<AbortController | null>(null);
  const checkController = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const generation = useRef(0);
  const last = turns.at(-1);
  const decision = last?.decision ?? null;

  useEffect(() => {
    return () => {
      controller.current?.abort();
      checkController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (nearBottom.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [turns]);
  useEffect(() => {
    if (busy || checking) return;
    const timer = window.setTimeout(() => setPhase("sleep"), 90_000);
    return () => clearTimeout(timer);
  }, [busy, checking, turns.length, draft]);

  async function checkSource() {
    if (checking || controller.current) return;
    const c = new AbortController();
    checkController.current = c;
    setChecking(true);
    setPhase("checking");
    try {
      const result = await sourceCache.get(true, c.signal);
      setSource(result);
      setPhase(result.available ? "ready" : "unavailable");
      setNotice(
        result.available
          ? "Source verified against Sepolia."
          : `${result.detail} Normal mode is available.`,
      );
    } catch {
      setPhase("idle");
    } finally {
      setChecking(false);
      checkController.current = null;
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (controller.current || checking) return;
    if (!key) {
      setPanel("key");
      return;
    }
    if (!draft.trim()) {
      setFormError("Write a message to start.");
      promptRef.current?.focus();
      return;
    }
    if (draft.length > 12000) {
      setFormError("Keep this message under 12,000 characters.");
      promptRef.current?.focus();
      return;
    }
    const c = new AbortController();
    controller.current = c;
    const run = ++generation.current;
    const id = crypto.randomUUID();
    const prompt = draft.trim();
    const history = turns
      .filter((t) => t.status === "complete")
      .flatMap((t) => [
        { role: "user" as const, content: t.prompt },
        { role: "assistant" as const, content: t.answer },
      ]);
    if (
      history.reduce((sum, m) => sum + m.content.length, prompt.length) >
      100_000
    ) {
      controller.current = null;
      setFormError(
        "This conversation is full. Export it, then clear chat to start another.",
      );
      return;
    }
    setFormError("");
    setNotice("");
    setBusy(true);
    setDraft("");
    nearBottom.current = true;
    setTurns((ts) => [
      ...ts,
      { id, prompt, answer: "", status: "pending", decision: null, model },
    ]);
    const update = (fn: (t: Turn) => Turn) => {
      if (generation.current === run)
        setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
    };
    try {
      setPhase("checking");
      const verified = await sourceCache.get(false, c.signal);
      c.signal.throwIfAborted();
      setSource(verified);
      const selected = await decide(verified, state.current, config);
      c.signal.throwIfAborted();
      state.current = selected.after;
      update((t) => ({ ...t, decision: selected }));
      setPhase(selected.mode === "creative" ? "creative" : "normal");
      await streamChat({
        key,
        model,
        messages: [...history, { role: "user", content: prompt }],
        instruction: guidance(selected),
        signal: c.signal,
        onText: (content) => {
          if (generation.current === run) {
            setPhase("streaming");
            update((t) => ({ ...t, answer: t.answer + content }));
          }
        },
      });
      update((t) => ({ ...t, status: "complete" }));
      setPhase("complete");
      setNotice("Response complete.");
    } catch (error) {
      if (generation.current !== run) return;
      const cancelled = c.signal.aborted;
      const message = cancelled
        ? "Stopped. Partial text is kept. This turn is excluded from future context."
        : error instanceof ProviderError
          ? error.message
          : "The request could not be completed. Check your connection and send again.";
      update((t) => ({
        ...t,
        status: cancelled ? "cancelled" : "error",
        error: message,
      }));
      setPhase(cancelled ? "cancelled" : "error");
      setNotice(message);
    } finally {
      if (generation.current === run) {
        setBusy(false);
        controller.current = null;
        promptRef.current?.focus();
      }
    }
  }

  function clear() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    checkController.current?.abort();
    checkController.current = null;
    setTurns([]);
    setDraft("");
    setBusy(false);
    setChecking(false);
    setKey("");
    setPanel(null);
    setReceiptTurn(null);
    setPhase("idle");
    setSource(null);
    setFormError("");
    state.current = newSession();
    setNotice("Chat and key cleared. A new session is ready.");
    promptRef.current?.focus();
  }
  function exportChat() {
    const data = {
      application: "Squeek Mode",
      version: 1,
      exportedAt: new Date().toISOString(),
      session: state.current,
      turns,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "squeek-conversation.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Conversation exported. It includes message text and source receipts, never the API key.",
    );
  }
  function showReceipt(selected?: Decision | null) {
    setReceiptTurn(selected ?? null);
    setPanel("receipt");
  }

  return (
    <>
      <a href="#chat" className="skip-link">
        Skip to chat
      </a>
      <header className="site-header">
        <a className="brand" href="./" aria-label="Squeek Mode home">
          <span className="brand-hamster" aria-hidden="true">
            (•ᴥ•)
          </span>
          <span>
            Squeek<span className="brand-mode"> mode</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className="nav-button"
            aria-label="Scene gallery"
            onClick={() => setPanel("gallery")}
          >
            <Icon name="grid" />
            <span>Scene gallery</span>
          </button>
          <button
            className="nav-button"
            aria-label="Get the skill"
            onClick={() => setPanel("skill")}
          >
            <Icon name="code" />
            <span>Get the skill</span>
          </button>
          <button
            className={`key-button ${key ? "key-active" : ""}`}
            onClick={() => setPanel("key")}
            disabled={busy}
          >
            <Icon name="key" />
            <span>{key ? "Key connected" : "Add API key"}</span>
            {key && <span className="status-dot" />}
          </button>
        </nav>
      </header>

      <main className="workspace" id="chat">
        <div className="intro">
          <h1>A little room for a detour.</h1>
          <p>Reliable AI chat. Occasionally, a different way through.</p>
        </div>
        <div className="workbench">
          <section className="chat-panel" aria-labelledby="chat-title">
            <div className="chat-heading">
              <h2 id="chat-title">Your conversation</h2>
              <div className="chat-tools">
                <button
                  className="icon-button"
                  aria-label="Export conversation"
                  title="Export conversation"
                  disabled={!turns.length || busy}
                  onClick={exportChat}
                >
                  <Icon name="download" />
                </button>
                <button
                  className="icon-button"
                  aria-label="Clear chat and key"
                  title="Clear chat and key"
                  disabled={!turns.length && !key && !draft}
                  onClick={() => setPanel("clear")}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
            <div
              className="conversation"
              role="region"
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                nearBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              }}
              aria-label="Conversation messages"
              tabIndex={0}
            >
              {!turns.length ? (
                <div className="empty-chat">
                  <div className="hello-hamster" aria-hidden="true">
                    <pre>{" (\\_/)\n (o.o)\n / >✳"}</pre>
                    <span className="hello-spark">+</span>
                  </div>
                  <h3>Big question. Small companion.</h3>
                  <p>Bring a thought. We’ll find a way through.</p>
                  <div className="suggestions">
                    {suggestions.map((label, i) => (
                      <button
                        key={label}
                        onClick={() => {
                          setDraft(prompts[i]);
                          promptRef.current?.focus();
                        }}
                      >
                        <span>{label}</span>
                        <Icon name="arrow" size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="message-list">
                  {turns.map((turn) => (
                    <article className="turn" key={turn.id}>
                      <div className="user-message">
                        <span className="speaker">You</span>
                        <p dir="auto">{turn.prompt}</p>
                      </div>
                      <div className="assistant-message">
                        <div className="answer-heading">
                          <span className="speaker">
                            Squeek{" "}
                            <span className="model-note">
                              /{" "}
                              {MODELS.find((m) => m.id === turn.model)?.name ??
                                turn.model}
                            </span>
                          </span>
                          {turn.decision && (
                            <button
                              className={`route-tag ${turn.decision.mode === "creative" ? "creative-tag" : ""}`}
                              onClick={() => showReceipt(turn.decision)}
                            >
                              <Icon
                                name={turn.decision.move ? "branch" : "check"}
                                size={14}
                              />
                              {turn.decision.move
                                ? MOVE_INFO[turn.decision.move].title
                                : "Normal route"}
                            </button>
                          )}
                        </div>
                        {turn.answer && (
                          <div className="answer-text" dir="auto">
                            {turn.answer}
                          </div>
                        )}
                        {!turn.answer && turn.status === "pending" && (
                          <p className="waiting">
                            {phase === "checking"
                              ? "Checking the source…"
                              : "Waiting for the model…"}
                            <span className="waiting-cursor" aria-hidden="true">
                              ▍
                            </span>
                          </p>
                        )}
                        {turn.error && (
                          <p
                            className="turn-error"
                            role={turn.status === "error" ? "alert" : undefined}
                          >
                            {turn.error}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <form className="composer" onSubmit={send}>
              <label className="sr-only" htmlFor="prompt">
                Your message
              </label>
              <textarea
                id="prompt"
                ref={promptRef}
                rows={2}
                value={draft}
                maxLength={12000}
                placeholder="What are we working on?"
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "prompt-error" : "composer-hint"}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setFormError("");
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {formError && (
                <p id="prompt-error" className="field-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="composer-bottom">
                <span id="composer-hint">
                  {key
                    ? "Enter to send · Shift + Enter for a new line"
                    : "Your OpenRouter key stays in this tab."}
                </span>
                {busy ? (
                  <button
                    type="button"
                    className="primary-button stop-button"
                    onClick={() => controller.current?.abort()}
                  >
                    <Icon name="stop" size={16} />
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={checking}
                  >
                    <span>{key ? "Send" : "Start chatting"}</span>
                    <Icon name="arrow" size={18} />
                  </button>
                )}
              </div>
            </form>
            <div className="chat-foot">
              <span>
                <span className="status-dot" />
                {key ? "Key in memory only" : "Bring your own key"}
              </span>
              <span>One model call per turn</span>
            </div>
          </section>

          <aside className="habitat-column">
            <Habitat
              phase={phase}
              move={decision?.move ?? null}
              reused={
                source?.available === true && source.freshness === "reused"
              }
              cooldown={decision?.reason === "cooldown"}
              onGallery={() => setPanel("gallery")}
            />
            <section className="route-controls" aria-labelledby="route-title">
              <div className="section-heading">
                <h2 id="route-title">Room for curiosity</h2>
                <button
                  className="text-button"
                  onClick={() => setPanel("settings")}
                >
                  <Icon name="settings" size={16} />
                  Fine-tune
                </button>
              </div>
              <div className="frequency-heading">
                <label htmlFor="frequency">Creative frequency</label>
                <output htmlFor="frequency">
                  {config.frequency === 0 ? "Off" : `${config.frequency}%`}
                </output>
              </div>
              <input
                id="frequency"
                type="range"
                min="0"
                max="100"
                step="5"
                value={config.frequency}
                disabled={busy}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    frequency: Number(e.target.value),
                  }))
                }
                aria-describedby="frequency-hint"
              />
              <div className="range-labels">
                <span>Stay the course</span>
                <span>Take more detours</span>
              </div>
              <p id="frequency-hint">
                {config.frequency === 0
                  ? "Every turn follows the normal route."
                  : `A ${config.frequency}% chance on eligible turns, with ${config.cooldown} normal ${config.cooldown === 1 ? "turn" : "turns"} between detours.`}
              </p>
            </section>
            <section className="source-panel" aria-labelledby="source-title">
              <div className="source-summary">
                <span
                  className={`status-dot ${source?.available ? "" : "neutral-dot"}`}
                />
                <div>
                  <h2 id="source-title">
                    {checking || (busy && phase === "checking")
                      ? "Checking Squeekchain"
                      : source?.available
                        ? `Round ${source.round.roundId} verified`
                        : source
                          ? "Normal mode available"
                          : "Rooted in Squeekchain"}
                  </h2>
                  <p>
                    {source?.available
                      ? `${source.freshness === "fresh" ? "Fresh" : "Reused"} source · Ethereum Sepolia`
                      : source
                        ? "Source unavailable · safe fallback"
                        : "Read-only Sepolia activity. No wallet or gas."}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Check source"
                  title="Check source"
                  onClick={() => void checkSource()}
                  disabled={checking || busy}
                >
                  <Icon name="refresh" />
                </button>
              </div>
              <button
                className="text-button receipt-link"
                onClick={() => showReceipt()}
              >
                Inspect source receipt <Icon name="arrow" size={16} />
              </button>
            </section>
          </aside>
        </div>
        <div className="below-workbench">
          <span>
            <Icon name="branch" size={16} />
            Different approaches. Same destination.
          </span>
          <p>Your goals and safety rules stay in charge.</p>
          <button className="text-button" onClick={() => setPanel("skill")}>
            Take Squeek to your agent <Icon name="arrow" size={16} />
          </button>
        </div>
      </main>
      <footer className="site-footer">
        <span>
          Squeek Mode <span className="footer-divider">/</span> A small
          experiment in useful curiosity.
        </span>
        <button className="text-button" onClick={() => setPanel("settings")}>
          {MODELS.find((m) => m.id === model)?.name}
          <Icon name="settings" size={14} />
        </button>
      </footer>
      <div className="sr-only" role="status" aria-live="polite">
        {notice}
      </div>

      {panel === "key" && (
        <Modal
          title={key ? "Key settings" : "Bring your own key"}
          onClose={() => setPanel(null)}
        >
          <KeyForm
            connected={Boolean(key)}
            onSave={(value) => {
              setKey(value);
              setPanel(null);
              setNotice(
                "Key connected for this tab. No provider request was sent.",
              );
              promptRef.current?.focus();
            }}
            onForget={() => {
              setKey("");
              setPanel(null);
              setNotice("API key removed from this tab.");
            }}
          />
        </Modal>
      )}
      {panel === "settings" && (
        <Modal title="Make room for curiosity" onClose={() => setPanel(null)}>
          <div className="settings-form">
            <label htmlFor="model">OpenRouter model</label>
            <select
              id="model"
              value={model}
              disabled={busy}
              onChange={(e) => setModel(e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p>
              Each send makes one streaming call. Pricing depends on the model
              and your OpenRouter account. Output is capped at 2,048 tokens;
              this is not a spending cap.
            </p>
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noreferrer"
              className="text-button"
            >
              Check current model pricing <Icon name="external" size={16} />
            </a>
            <label htmlFor="settings-frequency">
              Creative frequency <span>{config.frequency}%</span>
            </label>
            <input
              id="settings-frequency"
              type="range"
              min="0"
              max="100"
              step="5"
              value={config.frequency}
              disabled={busy}
              onChange={(e) =>
                setConfig((c) => ({ ...c, frequency: Number(e.target.value) }))
              }
            />
            <label htmlFor="cooldown">Normal turns between detours</label>
            <select
              id="cooldown"
              value={config.cooldown}
              disabled={busy}
              onChange={(e) =>
                setConfig((c) => ({ ...c, cooldown: Number(e.target.value) }))
              }
            >
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "turn" : "turns"}
                </option>
              ))}
            </select>
            <p>
              The frequency applies after cooldown. A source check may take up
              to 6.5 seconds. If verification fails, the turn stays normal.
              Habitat animation never adds a delay.
            </p>
            <details>
              <summary>How the route is selected</summary>
              <p>
                SHA-256 combines verified active-round data with this tab’s
                session and turn counter. The same inputs give the same route.
                Receipts include everything needed to reproduce it. The source
                is public and is not security-grade randomness.
              </p>
              <p>
                Creative moves change answer guidance only. They never grant
                permissions or trigger external actions.
              </p>
            </details>
          </div>
        </Modal>
      )}
      {panel === "gallery" && (
        <Modal
          title="A life in 28 little scenes"
          onClose={() => setPanel(null)}
          wide
        >
          <Gallery />
        </Modal>
      )}
      {panel === "receipt" && (
        <Modal title="Follow the source" onClose={() => setPanel(null)}>
          <Receipt
            source={receiptTurn?.source ?? source}
            decision={receiptTurn}
          />
        </Modal>
      )}
      {panel === "clear" && (
        <Modal title="Clear this conversation?" onClose={() => setPanel(null)}>
          <p>
            This clears conversation messages and their receipts, forgets the
            API key, and stops any active request. Export first if you want to
            keep the conversation.
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setPanel(null)}>
              Keep chatting
            </button>
            <button className="primary-button danger-button" onClick={clear}>
              Clear chat and key
            </button>
          </div>
        </Modal>
      )}
      {panel === "skill" && (
        <Modal
          title="A small skill. A wider habitat."
          onClose={() => setPanel(null)}
        >
          <div className="skill-info">
            <pre className="skill-ascii" aria-hidden="true">
              {
                " (\\_/)     [ agent ]\n (o.o) ----> [       ]\n / >o       [_______]"
              }
            </pre>
            <p>
              Use the same deterministic engine in an agent workflow. The
              portable bundle includes SKILL.md, a standalone helper, receipts,
              and installation instructions.
            </p>
            <a
              className="primary-button"
              href="./squeek-mode-skill.zip"
              download
            >
              <Icon name="download" />
              Download the skill
            </a>
            <h3>Try the local host</h3>
            <p>Unzip, then run with Bun 1.3 or newer:</p>
            <pre className="command">
              <code>
                bun integrations/local-agent-host.mjs --prompt-file task.txt
              </code>
            </pre>
            <p>
              The included host checks the chain and prepares one request
              envelope. It makes no model call. Review the envelope before
              sending it through your agent.
            </p>
            <p className="fine-print">
              Tested with the included Bun local host. Other agent hosts require
              their own adapter and validation. Multi-agent “Hamster AI
              Backrooms” is reserved for phase 2.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

function KeyForm({
  connected,
  onSave,
  onForget,
}: {
  connected: boolean;
  onSave: (key: string) => void;
  onForget: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  return (
    <form
      className="key-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim() || /\s/.test(value.trim())) {
          setError("Paste an OpenRouter API key without spaces.");
          return;
        }
        if (!consent) {
          setError("Confirm how requests use your key before connecting.");
          return;
        }
        onSave(value.trim());
        setValue("");
      }}
    >
      <p>
        Requests go directly from your browser to OpenRouter. Your key stays in
        memory and is removed when you reload, clear chat, or forget it.
      </p>
      <label htmlFor="api-key">OpenRouter API key</label>
      <input
        data-initial-focus
        id="api-key"
        name="squeek-api-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        value={value}
        placeholder="Paste your key"
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "key-note key-error" : "key-note"}
      />
      <p id="key-note" className="fine-print">
        Set a credit limit for this key in OpenRouter. Connecting saves it in
        this tab; it does not make a model call.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I understand that sending messages shares conversation text with
          OpenRouter and the selected provider, and may use paid credits.
        </span>
      </label>
      {error && (
        <p id="key-error" className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {connected && (
          <button type="button" className="secondary-button" onClick={onForget}>
            Forget key
          </button>
        )}
        <button type="submit" className="primary-button">
          <Icon name="key" />
          Connect key
        </button>
      </div>
      <a
        className="text-button"
        href="https://openrouter.ai/settings/keys"
        target="_blank"
        rel="noreferrer"
      >
        Manage OpenRouter keys <Icon name="external" size={16} />
      </a>
    </form>
  );
}
