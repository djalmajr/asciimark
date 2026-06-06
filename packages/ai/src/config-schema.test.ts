import { describe, expect, it } from "bun:test";
import type { ProviderConfig } from "./config-schema.ts";
import { mergeConfigs, parseUserConfig } from "./config-schema.ts";

const BUILTINS: Record<string, ProviderConfig> = {
  anthropic: {
    kind: "anthropic",
    name: "Anthropic",
    models: {
      "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
    },
  },
  ollama: {
    kind: "openai-compatible",
    name: "Ollama (local)",
    options: { baseURL: "http://localhost:11434/v1" },
    models: {},
  },
};

describe("parseUserConfig", () => {
  it("parses a well-formed user config", () => {
    const parsed = parseUserConfig(
      JSON.stringify({ model: "ollama/llama3.1:8b", provider: { ollama: { models: { "llama3.1:8b": { name: "Llama 3.1 8B" } } } } }),
    );
    expect(parsed?.model).toBe("ollama/llama3.1:8b");
    expect(parsed?.provider?.ollama?.models?.["llama3.1:8b"]?.name).toBe("Llama 3.1 8B");
  });

  it("returns null for malformed JSON", () => {
    expect(parseUserConfig("{not json")).toBeNull();
  });

  it("returns null when the shape mismatches the schema", () => {
    // model must be a string
    expect(parseUserConfig(JSON.stringify({ model: 123 }))).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseUserConfig(null)).toBeNull();
  });
});

describe("mergeConfigs", () => {
  it("returns the builtins unchanged when the user config is empty", () => {
    const merged = mergeConfigs(BUILTINS, {});
    expect(merged.provider.anthropic.kind).toBe("anthropic");
    expect(merged.model).toBeUndefined();
  });

  it("does not mutate the builtins (deep clone)", () => {
    mergeConfigs(BUILTINS, { provider: { anthropic: { name: "Custom" } } });
    expect(BUILTINS.anthropic.name).toBe("Anthropic");
  });

  it("carries through model / small_model", () => {
    const merged = mergeConfigs(BUILTINS, { model: "anthropic/claude-sonnet-4-6", small_model: "anthropic/claude-sonnet-4-6" });
    expect(merged.model).toBe("anthropic/claude-sonnet-4-6");
    expect(merged.small_model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("adds a model to a built-in provider without dropping existing ones", () => {
    const merged = mergeConfigs(BUILTINS, {
      provider: { ollama: { models: { "llama3.1:8b": { name: "Llama 3.1 8B" } } } },
    });
    expect(Object.keys(merged.provider.ollama.models)).toEqual(["llama3.1:8b"]);
    // kind/name/baseURL inherited from the builtin
    expect(merged.provider.ollama.kind).toBe("openai-compatible");
    expect(merged.provider.ollama.options?.baseURL).toBe("http://localhost:11434/v1");
  });

  it("merges options (override wins, baseURL inherited) and headers", () => {
    const merged = mergeConfigs(BUILTINS, {
      provider: { ollama: { options: { headers: { "X-Test": "1" } } } },
    });
    expect(merged.provider.ollama.options?.baseURL).toBe("http://localhost:11434/v1");
    expect(merged.provider.ollama.options?.headers).toEqual({ "X-Test": "1" });
  });

  it("adds a fully-specified custom provider", () => {
    const merged = mergeConfigs(BUILTINS, {
      provider: {
        lmstudio: { kind: "openai-compatible", name: "LM Studio", options: { baseURL: "http://localhost:1234/v1" }, models: { local: { name: "Local" } } },
      },
    });
    expect(merged.provider.lmstudio.name).toBe("LM Studio");
    expect(merged.provider.lmstudio.kind).toBe("openai-compatible");
  });

  it("drops an incomplete custom provider (missing kind/name)", () => {
    const merged = mergeConfigs(BUILTINS, {
      provider: { broken: { options: { baseURL: "http://x" } } },
    });
    expect(merged.provider.broken).toBeUndefined();
  });
});
