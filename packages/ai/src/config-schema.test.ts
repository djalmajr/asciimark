import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import type { ProviderConfig } from "./config-schema.ts";
import { MCPServerConfigSchema, mergeConfigs, parseUserConfig } from "./config-schema.ts";

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

describe("MCPServerConfigSchema — transport cross-field rule", () => {
  it("accepts a stdio server with a command", () => {
    const result = v.safeParse(MCPServerConfigSchema, {
      id: "memory",
      transport: "stdio",
      command: "bunx",
      args: ["ai-memory-mcp"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an http server with a url", () => {
    const result = v.safeParse(MCPServerConfigSchema, {
      id: "remote",
      transport: "http",
      url: "https://example.com/mcp",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stdio server without a command (e.g. only a url)", () => {
    const result = v.safeParse(MCPServerConfigSchema, {
      id: "broken",
      transport: "stdio",
      url: "https://example.com/mcp",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a stdio server with an empty/whitespace command", () => {
    expect(
      v.safeParse(MCPServerConfigSchema, { id: "x", transport: "stdio", command: "" }).success,
    ).toBe(false);
    expect(
      v.safeParse(MCPServerConfigSchema, { id: "x", transport: "stdio", command: "   " }).success,
    ).toBe(false);
  });

  it("rejects an http server without a url (e.g. only a command)", () => {
    const result = v.safeParse(MCPServerConfigSchema, {
      id: "broken",
      transport: "http",
      command: "bunx",
    });
    expect(result.success).toBe(false);
  });

  it("forwards the issue to the missing field", () => {
    const result = v.safeParse(MCPServerConfigSchema, { id: "x", transport: "stdio" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.path?.[0]?.key).toBe("command");
    }
  });
});

describe("parseUserConfig — per-entry mcp filtering", () => {
  const VALID_STDIO = { id: "memory", transport: "stdio", command: "bunx" };
  const VALID_HTTP = { id: "remote", transport: "http", url: "https://example.com/mcp" };

  it("keeps valid mcp entries in input order", () => {
    const parsed = parseUserConfig(JSON.stringify({ mcp: [VALID_STDIO, VALID_HTTP] }));
    expect(parsed?.mcp?.map((s) => s.id)).toEqual(["memory", "remote"]);
  });

  it("drops an invalid entry but keeps the rest of the config", () => {
    const parsed = parseUserConfig(
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-6",
        mcp: [VALID_STDIO, { id: "bad", transport: "http" }, VALID_HTTP],
      }),
    );
    // The bad entry must not nuke model/provider settings (null config).
    expect(parsed).not.toBeNull();
    expect(parsed?.model).toBe("anthropic/claude-sonnet-4-6");
    expect(parsed?.mcp?.map((s) => s.id)).toEqual(["memory", "remote"]);
  });

  it("drops non-object mcp entries", () => {
    const parsed = parseUserConfig(JSON.stringify({ mcp: ["nope", 42, null] }));
    expect(parsed?.mcp).toEqual([]);
  });

  it("still returns null when mcp itself is not an array", () => {
    expect(parseUserConfig(JSON.stringify({ mcp: { id: "x" } }))).toBeNull();
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
