import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "ai";
import { compactMessages, safeCutIndex } from "./compaction.ts";
import type { AIMessage } from "./types.ts";

/** Plain host history (string content, no tool messages possible). */
function plainHistory(turns: number): AIMessage[] {
  return Array.from({ length: turns }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `turn ${i}`,
  }));
}

/** A user → assistant(tool-call) → tool(result) → assistant(text) exchange,
 *  using the exact ModelMessage part shapes the AI SDK builds. */
function toolExchange(): ModelMessage[] {
  return [
    { role: "user", content: "hi" }, // 0
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "search", input: { q: "x" } }],
    }, // 1
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "search",
          output: { type: "text", value: "found" },
        },
      ],
    }, // 2
    { role: "assistant", content: "done" }, // 3
  ];
}

describe("safeCutIndex", () => {
  it("returns the desired index unchanged when no tools are involved", () => {
    const messages = plainHistory(6);
    for (let i = 0; i <= messages.length; i++) {
      expect(safeCutIndex(messages, i)).toBe(i);
    }
  });

  it("clamps to the array bounds (cut at 0, at end, and out of range)", () => {
    const messages = plainHistory(4);
    expect(safeCutIndex(messages, 0)).toBe(0);
    expect(safeCutIndex(messages, 4)).toBe(4);
    expect(safeCutIndex(messages, -3)).toBe(0);
    expect(safeCutIndex(messages, 99)).toBe(4);
    expect(safeCutIndex([], 0)).toBe(0);
    expect(safeCutIndex([], 5)).toBe(0);
  });

  it("moves a cut landing inside a call/result pair FORWARD past the result", () => {
    const messages = toolExchange();
    // Cutting at 2 would keep the tool result without its call — unsafe.
    expect(safeCutIndex(messages, 2)).toBe(3);
  });

  it("keeps a cut AT the assistant tool-call message (pair dropped or kept whole)", () => {
    const messages = toolExchange();
    // Keeping from index 1 keeps both the call and its result — safe as-is.
    expect(safeCutIndex(messages, 1)).toBe(1);
  });

  it("skips multiple consecutive tool-result messages", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" }, // 0
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "a", input: {} },
          { type: "tool-call", toolCallId: "c2", toolName: "b", input: {} },
        ],
      }, // 1
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "a", output: { type: "text", value: "1" } },
        ],
      }, // 2
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c2", toolName: "b", output: { type: "text", value: "2" } },
        ],
      }, // 3
      { role: "user", content: "next" }, // 4
    ];
    expect(safeCutIndex(messages, 2)).toBe(4);
    expect(safeCutIndex(messages, 3)).toBe(4);
  });

  it("falls BACK to the chain-opening assistant when the whole tail is the chain", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" }, // 0
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "c1", toolName: "a", input: {} }],
      }, // 1
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "a", output: { type: "text", value: "1" } },
        ],
      }, // 2
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "a", output: { type: "text", value: "2" } },
        ],
      }, // 3
    ];
    // Forward from 2 finds only tool messages, so the cut backs up to the
    // assistant that opened the chain instead of emptying the window.
    expect(safeCutIndex(messages, 2)).toBe(1);
    expect(safeCutIndex(messages, 3)).toBe(1);
  });

  it("treats a tool-approval-response tool message as chain continuation", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" }, // 0
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "a", input: {} },
          { type: "tool-approval-request", approvalId: "ap1", toolCallId: "c1" },
        ],
      }, // 1
      {
        role: "tool",
        content: [{ type: "tool-approval-response", approvalId: "ap1", approved: true }],
      }, // 2
      { role: "assistant", content: "done" }, // 3
    ];
    expect(safeCutIndex(messages, 2)).toBe(3);
  });

  it("never mutates the input", () => {
    const messages = toolExchange();
    const snapshot = structuredClone(messages);
    safeCutIndex(messages, 2);
    expect(messages).toEqual(snapshot);
  });
});

describe("compactMessages", () => {
  it("returns the same array when under or at the budget", () => {
    const messages = plainHistory(10);
    expect(compactMessages(messages, 10)).toBe(messages);
    expect(compactMessages(messages, 11)).toBe(messages);
  });

  it("drops the oldest messages down to the budget", () => {
    const messages = plainHistory(10);
    const out = compactMessages(messages, 4);
    expect(out).toHaveLength(4);
    expect(out).toEqual(messages.slice(6));
  });

  it("pins leading system messages and trims the tail to fit", () => {
    const system: AIMessage = { role: "system", content: "rules" };
    const messages = [system, ...plainHistory(9)];
    const out = compactMessages(messages, 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(system);
    expect(out.slice(1)).toEqual(messages.slice(7));
  });

  it("moves the cut past a tool chain straddling the boundary", () => {
    const exchange = toolExchange(); // user, assistant(call), tool, assistant
    const messages = [...plainHistory(2), ...exchange];
    // Budget 4 → naive cut at index 2... which keeps the chain whole (cut AT
    // the user opening the exchange). Budget 3 → naive cut at 3 (assistant w/
    // call — safe). Budget 2 → naive cut at 4 (the tool message — unsafe),
    // must move forward to 5.
    const out = compactMessages(messages, 2);
    expect(out).toEqual([exchange[3]]);
  });

  it("keeps the call/result pair whole when the budget would split it", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "c1", toolName: "a", input: {} }],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "a", output: { type: "text", value: "1" } },
        ],
      },
    ];
    // Budget 1 → naive cut at 2 (the result alone) — backward fallback keeps
    // the pair, accepting a result above budget.
    const out = compactMessages(messages, 1);
    expect(out).toEqual(messages.slice(1));
  });

  it("never mutates the input", () => {
    const messages = plainHistory(10);
    const snapshot = structuredClone(messages);
    compactMessages(messages, 4);
    expect(messages).toEqual(snapshot);
  });
});
