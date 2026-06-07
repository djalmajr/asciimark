import { describe, expect, it } from "bun:test";
import {
  createApprovalGate,
  needsApproval,
  resolveApprovalTier,
  withApproval,
} from "./approval-policy.ts";
import type { AITool } from "./types.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

const tool = (over: Partial<AITool>): AITool => ({
  name: "t",
  inputSchema: { type: "object" },
  execute: async () => null,
  ...over,
});

describe("resolveApprovalTier", () => {
  it("honors an explicit approval tier", () => {
    expect(resolveApprovalTier(tool({ approval: "prompt", source: "app" }))).toBe("prompt");
    expect(resolveApprovalTier(tool({ approval: "auto", source: "some-mcp" }))).toBe("auto");
  });

  it("auto-runs in-process app tools", () => {
    expect(resolveApprovalTier(tool({ source: "app" }))).toBe("auto");
  });

  it("prompts for MCP / unknown-source tools by default", () => {
    expect(resolveApprovalTier(tool({ source: "ai-memory" }))).toBe("prompt");
    expect(resolveApprovalTier(tool({}))).toBe("prompt"); // no source -> prompt
  });
});

describe("needsApproval", () => {
  it("is true exactly when the tier is prompt", () => {
    expect(needsApproval(tool({ source: "ai-memory" }))).toBe(true);
    expect(needsApproval(tool({ source: "app" }))).toBe(false);
    expect(needsApproval(tool({ source: "app", approval: "prompt" }))).toBe(true);
  });
});

describe("withApproval", () => {
  it("returns auto-tier tools unchanged (no wrapper)", () => {
    const t = tool({ source: "app" });
    expect(withApproval(t, async () => true)).toBe(t);
  });

  it("executes a prompt-tier tool when approved, threading opts", async () => {
    let executedWith: unknown;
    const t = tool({
      source: "ai-memory",
      execute: async (args) => {
        executedWith = args;
        return { ok: true };
      },
    });
    const wrapped = withApproval(t, async () => true);
    const result = await wrapped.execute({ q: 1 });
    expect(result).toEqual({ ok: true });
    expect(executedWith).toEqual({ q: 1 });
  });

  it("skips execution and returns a rejection result when denied", async () => {
    let ran = false;
    const t = tool({
      source: "ai-memory",
      execute: async () => {
        ran = true;
        return "should-not-run";
      },
    });
    const wrapped = withApproval(t, async () => false);
    const result = await wrapped.execute({});
    expect(ran).toBe(false);
    expect(result).toEqual({ rejected: true, error: 'User rejected the "t" tool call.' });
  });

  it("passes the request details (incl. signal) to the approver", async () => {
    let seen: { toolName: string; source?: string; args: unknown } | undefined;
    const t = tool({ name: "ai-memory__q", source: "ai-memory" });
    const wrapped = withApproval(t, async (req) => {
      seen = { toolName: req.toolName, source: req.source, args: req.args };
      return true;
    });
    await wrapped.execute({ a: 1 });
    expect(seen).toEqual({ toolName: "ai-memory__q", source: "ai-memory", args: { a: 1 } });
  });

  it("never asks or runs when the signal is already aborted", async () => {
    let asked = false;
    let ran = false;
    const ctrl = new AbortController();
    ctrl.abort();
    const t = tool({ source: "ai-memory", execute: async () => ((ran = true), null) });
    const wrapped = withApproval(t, async () => ((asked = true), true));
    const result = await wrapped.execute({}, { signal: ctrl.signal });
    expect(asked).toBe(false);
    expect(ran).toBe(false);
    expect(result).toEqual({ rejected: true, error: 'The "t" tool call was aborted.' });
  });

  it("does NOT run the side effect if aborted during approval (late Accept loses)", async () => {
    let ran = false;
    const ctrl = new AbortController();
    const t = tool({ source: "ai-memory", execute: async () => ((ran = true), "side-effect") });
    // Approver resolves true, but the run was aborted while it was pending.
    const wrapped = withApproval(t, async () => {
      ctrl.abort();
      return true;
    });
    const result = await wrapped.execute({}, { signal: ctrl.signal });
    expect(ran).toBe(false);
    expect(result).toEqual({ rejected: true, error: 'The "t" tool call was aborted.' });
  });
});

describe("createApprovalGate", () => {
  it("serializes concurrent prompts FIFO (one shown at a time) and settles both", async () => {
    const shown: string[] = [];
    const deciders: Array<(v: boolean) => void> = [];
    const gate = createApprovalGate((req, decide) => {
      shown.push(req.toolName);
      deciders.push(decide);
      return () => {};
    });
    const p1 = gate({ toolName: "a", args: {} });
    const p2 = gate({ toolName: "b", args: {} });
    await tick();
    expect(shown).toEqual(["a"]); // second is queued, not shown yet
    deciders[0]!(true);
    expect(await p1).toBe(true);
    await tick();
    expect(shown).toEqual(["a", "b"]); // now the second shows
    deciders[1]!(false);
    expect(await p2).toBe(false);
  });

  it("auto-denies and hides a pending prompt when the signal aborts", async () => {
    let hidden = false;
    const ctrl = new AbortController();
    const gate = createApprovalGate(() => () => {
      hidden = true;
    });
    const p = gate({ toolName: "a", args: {}, signal: ctrl.signal });
    await tick();
    ctrl.abort();
    expect(await p).toBe(false);
    expect(hidden).toBe(true);
  });

  it("resolves false without showing when the request is pre-aborted", async () => {
    let shown = false;
    const ctrl = new AbortController();
    ctrl.abort();
    const gate = createApprovalGate(() => {
      shown = true;
      return () => {};
    });
    expect(await gate({ toolName: "a", args: {}, signal: ctrl.signal })).toBe(false);
    expect(shown).toBe(false);
  });

  it("a rejected prompt does not block the next one in the queue", async () => {
    const deciders: Array<(v: boolean) => void> = [];
    const gate = createApprovalGate((_req, decide) => {
      deciders.push(decide);
      return () => {};
    });
    const p1 = gate({ toolName: "a", args: {} });
    const p2 = gate({ toolName: "b", args: {} });
    await tick();
    deciders[0]!(false);
    expect(await p1).toBe(false);
    await tick();
    expect(deciders.length).toBe(2); // second still ran
    deciders[1]!(true);
    expect(await p2).toBe(true);
  });
});
