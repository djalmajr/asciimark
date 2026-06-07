import { describe, expect, it } from "bun:test";
import { mapFullStream } from "./ai-sdk.ts";
import type { AIStreamPart } from "../types.ts";

type Part = { type: string } & Record<string, unknown>;

async function* gen(parts: Part[]): AsyncIterable<Part> {
  for (const p of parts) yield p;
}

async function collect(stream: AsyncIterable<AIStreamPart>): Promise<AIStreamPart[]> {
  const out: AIStreamPart[] = [];
  for await (const part of stream) out.push(part);
  return out;
}

describe("mapFullStream", () => {
  it("maps text-delta parts and ends with a done carrying usage", async () => {
    const out = await collect(
      mapFullStream(
        gen([
          { type: "text-delta", text: "Hel" },
          { type: "text-delta", text: "lo" },
          { type: "finish", totalUsage: { inputTokens: 3, outputTokens: 5 } },
        ]),
      ),
    );
    expect(out).toEqual([
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo" },
      { type: "done", usage: { inputTokens: 3, outputTokens: 5 } },
    ]);
  });

  it("supports the legacy textDelta field", async () => {
    const out = await collect(mapFullStream(gen([{ type: "text-delta", textDelta: "x" }])));
    expect(out[0]).toEqual({ type: "text-delta", text: "x" });
  });

  it("maps tool-call (with source) and tool-result", async () => {
    const out = await collect(
      mapFullStream(
        gen([
          { type: "tool-call", toolCallId: "c1", toolName: "ai-memory__q", input: { a: 1 } },
          { type: "tool-result", toolCallId: "c1", toolName: "ai-memory__q", output: { ok: true } },
          { type: "finish" },
        ]),
        new Map([["ai-memory__q", "ai-memory"]]),
      ),
    );
    expect(out[0]).toEqual({
      type: "tool-call",
      toolCallId: "c1",
      toolName: "ai-memory__q",
      source: "ai-memory",
      args: { a: 1 },
    });
    expect(out[1]).toEqual({
      type: "tool-result",
      toolCallId: "c1",
      toolName: "ai-memory__q",
      result: { ok: true },
    });
  });

  it("maps tool-error to a tool-result with isError", async () => {
    const out = await collect(
      mapFullStream(gen([{ type: "tool-error", toolCallId: "c1", toolName: "t", error: "boom" }])),
    );
    expect(out[0]).toEqual({
      type: "tool-result",
      toolCallId: "c1",
      toolName: "t",
      result: "boom",
      isError: true,
    });
  });

  it("emits a classified error and STOPS (no trailing done)", async () => {
    const out = await collect(
      mapFullStream(
        gen([
          { type: "text-delta", text: "partial" },
          { type: "error", error: { statusCode: 401, message: "nope" } },
          { type: "finish" }, // must be ignored — stream already terminated
        ]),
      ),
    );
    expect(out).toEqual([
      { type: "text-delta", text: "partial" },
      { type: "error", code: "auth", message: "nope" },
    ]);
  });

  it("maps tool-output-denied to a tool-result with isError", async () => {
    const out = await collect(
      mapFullStream(gen([{ type: "tool-output-denied", toolCallId: "c1", toolName: "t" }, { type: "finish" }])),
    );
    expect(out[0]).toEqual({
      type: "tool-result",
      toolCallId: "c1",
      toolName: "t",
      result: { rejected: true },
      isError: true,
    });
  });

  it("maps an abort part to an aborted error and stops", async () => {
    const out = await collect(
      mapFullStream(gen([{ type: "abort" }, { type: "finish" }])),
    );
    expect(out).toEqual([{ type: "error", code: "aborted", message: "Request aborted" }]);
  });

  it("ignores non-mapped part types", async () => {
    const out = await collect(
      mapFullStream(
        gen([
          { type: "start" },
          { type: "start-step" },
          { type: "reasoning-delta", text: "thinking" },
          { type: "tool-input-delta", delta: "{" },
          { type: "text-delta", text: "hi" },
          { type: "finish-step" },
          { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } },
        ]),
      ),
    );
    expect(out).toEqual([
      { type: "text-delta", text: "hi" },
      { type: "done", usage: { inputTokens: 1, outputTokens: 1 } },
    ]);
  });

  it("emits a done with zero usage when finish carries none", async () => {
    const out = await collect(mapFullStream(gen([{ type: "text-delta", text: "x" }])));
    expect(out[out.length - 1]).toEqual({
      type: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });
});
