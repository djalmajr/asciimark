import { describe, expect, it } from "bun:test";
import type { ProviderConfig } from "./config-schema.ts";
import { resolveCredential } from "./resolve-credential.ts";

const anthropic: ProviderConfig = {
  kind: "anthropic",
  name: "Anthropic",
  models: { "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" } },
};

describe("resolveCredential precedence", () => {
  it("conventional env var wins over keychain and config", async () => {
    const key = await resolveCredential(
      "anthropic",
      { ...anthropic, options: { apiKey: "literal-config" } },
      {
        env: (n) => (n === "ANTHROPIC_API_KEY" ? "from-env" : undefined),
        keychain: () => "from-keychain",
      },
    );
    expect(key).toBe("from-env");
  });

  it("keychain wins over config when no env var", async () => {
    const key = await resolveCredential(
      "anthropic",
      { ...anthropic, options: { apiKey: "literal-config" } },
      { env: () => undefined, keychain: () => "from-keychain" },
    );
    expect(key).toBe("from-keychain");
  });

  it("falls back to a literal config apiKey", async () => {
    const key = await resolveCredential(
      "anthropic",
      { ...anthropic, options: { apiKey: "literal-config" } },
      { keychain: () => undefined },
    );
    expect(key).toBe("literal-config");
  });

  it("returns undefined (no throw) when nothing resolves", async () => {
    const key = await resolveCredential("anthropic", anthropic, {});
    expect(key).toBeUndefined();
  });
});

describe("resolveCredential substitution", () => {
  it("expands {env:VAR} in config apiKey", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "{env:MY_KEY}" } },
      { env: (n) => (n === "MY_KEY" ? "secret" : undefined) },
    );
    expect(key).toBe("secret");
  });

  it("expands {file:path} in config apiKey and trims it", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "{file:/keys/openai.txt}" } },
      { file: (p) => (p === "/keys/openai.txt" ? "  sk-from-file\n" : undefined) },
    );
    expect(key).toBe("sk-from-file");
  });

  it("returns undefined when an {env:VAR} reference is unset", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "{env:MISSING}" } },
      { env: () => undefined },
    );
    expect(key).toBeUndefined();
  });

  it("uses a provider with no conventional env mapping via keychain", async () => {
    const key = await resolveCredential("ollama", { ...anthropic, name: "Ollama" }, {
      keychain: (id) => (id === "ollama" ? "ollama-key" : undefined),
    });
    expect(key).toBe("ollama-key");
  });
});
