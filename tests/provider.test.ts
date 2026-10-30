import { describe, expect, test } from "bun:test";
import { readCompletion, streamChat } from "../shared/provider";
import { sse, completion } from "./fixtures";

describe("stream parser", () => {
  test("handles split UTF-8, CRLF, comments, empty choices and ignores reasoning", async () => {
    let text = "";
    await readCompletion(sse(completion("Hello, café 🐹."), 1), (t) => {
      text += t;
    });
    expect(text).toBe("Hello, café 🐹.");
    expect(text).not.toContain("PRIVATE");
  });
  test("supports multiline data fields and CR-only framing", async () => {
    let text = "";
    await readCompletion(
      sse(
        'data: {"choices":\rdata: [{"delta":{"content":"hello"}}]}\r\rdata: [DONE]\r\r',
      ),
      (t) => {
        text += t;
      },
    );
    expect(text).toBe("hello");
  });
  test("rejects error events without echoing their content", async () => {
    await expect(
      readCompletion(
        sse('data: {"error":{"message":"PRIVATE_KEY"}}\n\n'),
        () => {},
      ),
    ).rejects.toThrow("interrupted");
  });
  test("keeps partial text but identifies a truncated stream", async () => {
    let text = "";
    await expect(
      readCompletion(
        sse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
        (t) => {
          text += t;
        },
      ),
    ).rejects.toThrow("interrupted");
    expect(text).toBe("partial");
  });
  test("rejects malformed JSON", async () => {
    await expect(
      readCompletion(sse("data: {no}\n\n"), () => {}),
    ).rejects.toThrow("interrupted");
  });
  test("rejects a DONE stream without answer content", async () => {
    await expect(
      readCompletion(sse("data: [DONE]\n\n"), () => {}),
    ).rejects.toThrow("no answer");
  });
  test("bounds event buffering", async () => {
    await expect(
      readCompletion(sse("x".repeat(270_000), 270_000), () => {}),
    ).rejects.toThrow("interrupted");
  });
});

describe("provider request boundary", () => {
  test("makes exactly one call, only to OpenRouter, without cookies, redirects or fallback", async () => {
    let count = 0,
      text = "";
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      count++;
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(init?.credentials).toBe("omit");
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body));
      expect(body.provider.allow_fallbacks).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(body.messages[0].role).toBe("system");
      expect(body.max_tokens).toBe(2048);
      return new Response(sse(completion("One answer.")), {
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;
    await streamChat({
      key: "",
      model: "openai/gpt-4.1-mini",
      instruction: "Keep the goal.",
      messages: [{ role: "user", content: "Hi" }],
      signal: new AbortController().signal,
      fetcher,
      onText: (t) => {
        text += t;
      },
    });
    expect(count).toBe(1);
    expect(text).toBe("One answer.");
  });
  test.each([
    [401, "rejected"],
    [402, "insufficient"],
    [429, "rate limiting"],
    [503, "could not be reached"],
  ] as const)("does not retry HTTP %s", async (status, message) => {
    let count = 0;
    const fetcher = (async () => {
      count++;
      return new Response("PRIVATE_BODY", { status });
    }) as unknown as typeof fetch;
    await expect(
      streamChat({
        key: "",
        model: "openai/gpt-4.1-mini",
        messages: [],
        instruction: "",
        signal: new AbortController().signal,
        fetcher,
        onText: () => {},
      }),
    ).rejects.toThrow(message);
    expect(count).toBe(1);
  });
  test("Stop interrupts a pending read", async () => {
    const c = new AbortController();
    let cancelled = false;
    const fetcher = (async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      )) as unknown as typeof fetch;
    const task = streamChat({
      key: "",
      model: "openai/gpt-4.1-mini",
      messages: [],
      instruction: "",
      signal: c.signal,
      fetcher,
      onText: () => {},
    });
    setTimeout(() => c.abort(), 10);
    await expect(task).rejects.toThrow("Cancelled");
    expect(cancelled).toBe(true);
  });
});
