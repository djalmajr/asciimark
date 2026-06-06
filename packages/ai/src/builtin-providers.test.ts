import { describe, expect, it } from "bun:test";
import { BUILTIN_PROVIDERS, withBuiltins } from "./builtin-providers.ts";

describe("BUILTIN_PROVIDERS", () => {
  it("ships the M1 providers with valid kinds", () => {
    expect(Object.keys(BUILTIN_PROVIDERS).sort()).toEqual([
      "anthropic",
      "ollama",
      "openai",
      "opencode",
      "openrouter",
    ]);
    expect(BUILTIN_PROVIDERS.anthropic.kind).toBe("anthropic");
    expect(BUILTIN_PROVIDERS.openai.kind).toBe("openai");
    expect(BUILTIN_PROVIDERS.ollama.kind).toBe("openai-compatible");
    expect(BUILTIN_PROVIDERS.ollama.options?.baseURL).toBe("http://localhost:11434/v1");
  });
});

describe("withBuiltins", () => {
  it("merges a user-added Ollama model onto the builtin", () => {
    const config = withBuiltins({
      model: "ollama/llama3.1:8b",
      provider: { ollama: { models: { "llama3.1:8b": { name: "Llama 3.1 8B" } } } },
    });
    expect(config.model).toBe("ollama/llama3.1:8b");
    expect(config.provider.ollama.models["llama3.1:8b"].name).toBe("Llama 3.1 8B");
    expect(config.provider.ollama.options?.baseURL).toBe("http://localhost:11434/v1");
    // builtins untouched
    expect(config.provider.anthropic.kind).toBe("anthropic");
  });

  it("returns the full catalog for an empty config", () => {
    const config = withBuiltins({});
    expect(Object.keys(config.provider)).toHaveLength(5);
    expect(config.provider.opencode.options?.baseURL).toBe("https://opencode.ai/zen/go/v1");
  });
});
