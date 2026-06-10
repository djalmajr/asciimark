import { describe, expect, it } from "bun:test";
import { BUILTIN_PROVIDERS, withBuiltins } from "./builtin-providers.ts";

describe("BUILTIN_PROVIDERS", () => {
  it("ships the builtin providers with valid kinds", () => {
    expect(Object.keys(BUILTIN_PROVIDERS).sort()).toEqual([
      "anthropic",
      "lmstudio",
      "ollama",
      "openai",
      "opencode-go",
      "opencode-go-chat",
      "opencode-zen",
      "openrouter",
    ]);
    expect(BUILTIN_PROVIDERS.anthropic.kind).toBe("anthropic");
    expect(BUILTIN_PROVIDERS.openai.kind).toBe("openai");
    expect(BUILTIN_PROVIDERS.ollama.kind).toBe("openai-compatible");
    expect(BUILTIN_PROVIDERS.ollama.options?.baseURL).toBe("http://localhost:11434/v1");
    expect(BUILTIN_PROVIDERS.lmstudio.options?.baseURL).toBe("http://localhost:1234/v1");
  });

  it("splits OpenCode Go into anthropic (/messages) and openai-compatible (/chat/completions) shapes sharing one base URL", () => {
    const go = BUILTIN_PROVIDERS["opencode-go"];
    const goChat = BUILTIN_PROVIDERS["opencode-go-chat"];
    expect(go.kind).toBe("anthropic");
    expect(goChat.kind).toBe("openai-compatible");
    expect(go.options?.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(goChat.options?.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(go.models["minimax-m3"].name).toBe("MiniMax M3");
    expect(goChat.models["glm-5"].name).toBe("GLM-5");
  });

  it("ships OpenCode Zen as openai-compatible at zen/v1 with a live model catalog", () => {
    expect(BUILTIN_PROVIDERS["opencode-zen"].kind).toBe("openai-compatible");
    expect(BUILTIN_PROVIDERS["opencode-zen"].options?.baseURL).toBe("https://opencode.ai/zen/v1");
    expect(BUILTIN_PROVIDERS["opencode-zen"].models).toEqual({});
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
    expect(Object.keys(config.provider)).toHaveLength(8);
    expect(config.provider["opencode-go"].options?.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(config.provider["opencode-zen"].options?.baseURL).toBe("https://opencode.ai/zen/v1");
  });
});
