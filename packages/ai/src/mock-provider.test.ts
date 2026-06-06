import { describe, expect, it } from "bun:test";
import type { AIStreamPart } from "./types.ts";
import { NotSupportedError } from "./types.ts";
import { createMockProvider } from "./mock-provider.ts";

async function collect(stream: AsyncIterable<AIStreamPart>): Promise<AIStreamPart[]> {
  const out: AIStreamPart[] = [];
  for await (const part of stream) out.push(part);
  return out;
}

describe("createMockProvider.chat", () => {
  it("streams text-delta parts then a terminal done", async () => {
    const provider = createMockProvider({ reply: () => "hello world from mock", chunkDelayMs: 0, chunkSize: 1 });
    const parts = await collect(provider.chat([{ role: "user", content: "hi" }]));
    const last = parts[parts.length - 1];
    expect(last.type).toBe("done");
    const text = parts.filter((p) => p.type === "text-delta").map((p) => (p.type === "text-delta" ? p.text : "")).join("");
    expect(text).toBe("hello world from mock");
    // exactly one terminal part
    expect(parts.filter((p) => p.type === "done" || p.type === "error").length).toBe(1);
  });

  it("yields an aborted error when the signal is already aborted", async () => {
    const provider = createMockProvider({ chunkDelayMs: 0 });
    const controller = new AbortController();
    controller.abort();
    const parts = await collect(provider.chat([{ role: "user", content: "hi" }], { signal: controller.signal }));
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "error", code: "aborted", message: "Request aborted" });
  });
});

describe("createMockProvider.complete", () => {
  it("collects the stream into a string", async () => {
    const provider = createMockProvider({ reply: () => "one two three", chunkDelayMs: 0 });
    expect(await provider.complete("prompt")).toBe("one two three");
  });
});

describe("createMockProvider.embed", () => {
  it("rejects with NotSupportedError (RAG is M2)", async () => {
    const provider = createMockProvider();
    await expect(provider.embed("x")).rejects.toBeInstanceOf(NotSupportedError);
  });
});
