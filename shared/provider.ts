import type { ChatMessage } from "./types";

export const COMPLETIONS = "https://openrouter.ai/api/v1/chat/completions";
export class ProviderError extends Error {
  constructor(
    public code:
      "auth" | "credits" | "rate" | "network" | "stream" | "timeout" | "empty",
  ) {
    super(
      {
        auth: "OpenRouter rejected this key. Replace it in Key settings.",
        credits:
          "OpenRouter reported insufficient credits. Check your account balance.",
        rate: "OpenRouter is rate limiting requests. Wait a moment, then send again.",
        network:
          "The provider could not be reached. Check your connection and model, then send again.",
        stream:
          "The response was interrupted. Any partial answer is kept; send again only if needed.",
        timeout: "The response timed out. Any partial answer is kept.",
        empty: "The model returned no answer text. Try a different model.",
      }[code],
    );
  }
}

/** Parses SSE across arbitrary UTF-8 chunk boundaries; ignores private reasoning fields. */
export async function readCompletion(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    done = false,
    contentLength = 0;
  const processEvent = (event: string) => {
    const data = event
      .split(/\r\n|\r|\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let chunk: {
      error?: unknown;
      choices?: Array<{
        delta?: { content?: unknown };
        finish_reason?: string;
      }>;
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new ProviderError("stream");
    }
    if (
      !chunk ||
      typeof chunk !== "object" ||
      chunk.error ||
      chunk.choices?.some((c) => c.finish_reason === "error")
    )
      throw new ProviderError("stream");
    const content = chunk.choices?.[0]?.delta?.content;
    if (typeof content === "string") {
      contentLength += content.length;
      if (contentLength > 1_000_000) throw new ProviderError("stream");
      onText(content);
    }
  };
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (!done) {
      signal?.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      if (buffer.length > 262_144) throw new ProviderError("stream");
      let match: RegExpExecArray | null;
      while (!done && (match = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        processEvent(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
    }
    signal?.throwIfAborted();
    if (!done) throw new ProviderError("stream");
    if (contentLength === 0) throw new ProviderError("empty");
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
  }
}

/** Exactly one inference POST. No retries, tools, credential storage, or provider-body logging. */
export async function streamChat(options: {
  key: string;
  model: string;
  messages: ChatMessage[];
  instruction: string;
  signal: AbortSignal;
  onText: (text: string) => void;
  fetcher?: typeof fetch;
  maxTokens?: number;
}) {
  const timeout = AbortSignal.timeout(120_000);
  const signal = AbortSignal.any([options.signal, timeout]);
  try {
    const response = await (options.fetcher ?? fetch)(COMPLETIONS, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      signal,
      headers: {
        Authorization: `Bearer ${options.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        stream: true,
        max_tokens: options.maxTokens ?? 2048,
        provider: { allow_fallbacks: false, data_collection: "deny" },
        messages: [
          { role: "system", content: options.instruction },
          ...options.messages,
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(
        response.status === 401 || response.status === 403
          ? "auth"
          : response.status === 402
            ? "credits"
            : response.status === 429
              ? "rate"
              : "network",
      );
    }
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    )
      throw new ProviderError("stream");
    await readCompletion(response.body, options.onText, signal);
  } catch (error) {
    if (options.signal.aborted)
      throw new DOMException("Cancelled", "AbortError");
    if (timeout.aborted) throw new ProviderError("timeout");
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("network");
  }
}
