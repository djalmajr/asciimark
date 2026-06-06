import { describe, expect, it } from "bun:test";
import type { AIConfig } from "./config-schema.ts";
import {
  parseModelId,
  resolveDefaultModel,
  resolveModel,
  resolveSmallModel,
} from "./resolve-model.ts";

const CONFIG: AIConfig = {
  model: "anthropic/claude-sonnet-4-6",
  small_model: "anthropic/claude-haiku-4-5",
  provider: {
    anthropic: {
      kind: "anthropic",
      name: "Anthropic",
      models: {
        "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
        "claude-haiku-4-5": { name: "Claude Haiku 4.5" },
      },
    },
    openrouter: {
      kind: "openai-compatible",
      name: "OpenRouter",
      models: { "moonshotai/kimi-k2": { name: "Kimi K2" } },
    },
  },
};

describe("parseModelId", () => {
  it("splits provider/model on the first slash", () => {
    expect(parseModelId("anthropic/claude-sonnet-4-6")).toEqual({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
  });

  it("keeps slashes in the model id (OpenRouter style)", () => {
    expect(parseModelId("openrouter/moonshotai/kimi-k2")).toEqual({
      providerId: "openrouter",
      modelId: "moonshotai/kimi-k2",
    });
  });

  it("rejects ids without a usable split", () => {
    expect(parseModelId("noslash")).toBeNull();
    expect(parseModelId("/leading")).toBeNull();
    expect(parseModelId("trailing/")).toBeNull();
  });
});

describe("resolveModel", () => {
  it("resolves a known provider/model", () => {
    const r = resolveModel(CONFIG, "anthropic/claude-sonnet-4-6");
    expect(r?.providerId).toBe("anthropic");
    expect(r?.model.name).toBe("Claude Sonnet 4.6");
    expect(r?.provider.kind).toBe("anthropic");
  });

  it("resolves a model id containing a slash", () => {
    const r = resolveModel(CONFIG, "openrouter/moonshotai/kimi-k2");
    expect(r?.modelId).toBe("moonshotai/kimi-k2");
  });

  it("returns null for an unknown provider", () => {
    expect(resolveModel(CONFIG, "nope/x")).toBeNull();
  });

  it("returns null for an unknown model", () => {
    expect(resolveModel(CONFIG, "anthropic/ghost")).toBeNull();
  });

  it("returns null for undefined / malformed", () => {
    expect(resolveModel(CONFIG, undefined)).toBeNull();
    expect(resolveModel(CONFIG, "bad")).toBeNull();
  });
});

describe("resolveDefaultModel / resolveSmallModel", () => {
  it("resolves the configured default", () => {
    expect(resolveDefaultModel(CONFIG)?.modelId).toBe("claude-sonnet-4-6");
  });

  it("resolves the small model", () => {
    expect(resolveSmallModel(CONFIG)?.modelId).toBe("claude-haiku-4-5");
  });

  it("small model falls back to the main model when unset", () => {
    const r = resolveSmallModel({ ...CONFIG, small_model: undefined });
    expect(r?.modelId).toBe("claude-sonnet-4-6");
  });

  it("returns null when no default model is configured", () => {
    expect(resolveDefaultModel({ ...CONFIG, model: undefined })).toBeNull();
  });
});
