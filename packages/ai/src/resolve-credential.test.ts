import { describe, expect, it } from "bun:test";
import type { ProviderConfig } from "./config-schema.ts";
import { expandRecord, expandRefs, resolveCredential } from "./resolve-credential.ts";

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

  it("expands an EMBEDDED ref inside a larger apiKey string", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "Bearer {env:TOKEN}" } },
      { env: (n) => (n === "TOKEN" ? "t0k3n" : undefined) },
    );
    expect(key).toBe("Bearer t0k3n");
  });

  it("expands a {keychain:id} ref in config apiKey", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "{keychain:custom-alt}" } },
      { keychain: (id) => (id === "custom-alt" ? "kc-key" : undefined) },
    );
    expect(key).toBe("kc-key");
  });

  it("returns undefined (not a literal placeholder) when an embedded ref fails", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "Bearer {env:MISSING}" } },
      { env: () => undefined },
    );
    expect(key).toBeUndefined();
  });

  it("applies {env:VAR:-fallback} defaults in config apiKey", async () => {
    const key = await resolveCredential(
      "custom",
      { ...anthropic, options: { apiKey: "{env:MISSING:-sk-default}" } },
      { env: () => undefined },
    );
    expect(key).toBe("sk-default");
  });
});

describe("expandRefs (MCP headers/env)", () => {
  const resolvers = {
    env: (n: string) => (n === "TOKEN" ? "t0k3n" : undefined),
    file: (p: string) => (p === "/k" ? "  filekey\n" : undefined),
    keychain: (id: string) => (id === "mcp-linear" ? "kc-secret" : undefined),
  };

  it("returns a literal unchanged when there are no refs", async () => {
    expect(await expandRefs("application/json", resolvers)).toBe("application/json");
  });

  it("expands an embedded {env:} ref (Bearer token)", async () => {
    expect(await expandRefs("Bearer {env:TOKEN}", resolvers)).toBe("Bearer t0k3n");
  });

  it("expands {file:} (trimmed) and {keychain:}", async () => {
    expect(await expandRefs("{file:/k}", resolvers)).toBe("filekey");
    expect(await expandRefs("{keychain:mcp-linear}", resolvers)).toBe("kc-secret");
  });

  it("expands multiple refs in one value", async () => {
    expect(await expandRefs("{env:TOKEN}:{keychain:mcp-linear}", resolvers)).toBe("t0k3n:kc-secret");
  });

  it("returns undefined when any ref is unresolvable", async () => {
    expect(await expandRefs("Bearer {env:MISSING}", resolvers)).toBeUndefined();
    expect(await expandRefs("{keychain:nope}", resolvers)).toBeUndefined();
  });
});

describe("expandRefs {env:VAR:-fallback} defaults", () => {
  it("uses the fallback when the var is unset", async () => {
    expect(await expandRefs("{env:MISSING:-anon}", { env: () => undefined })).toBe("anon");
  });

  it("uses the fallback when the var is empty (shell `:-` semantics)", async () => {
    expect(await expandRefs("{env:EMPTY:-anon}", { env: () => "" })).toBe("anon");
  });

  it("prefers the real value when the var is set", async () => {
    expect(
      await expandRefs("{env:TOKEN:-anon}", { env: (n) => (n === "TOKEN" ? "t0k3n" : undefined) }),
    ).toBe("t0k3n");
  });

  it("supports an empty fallback", async () => {
    expect(await expandRefs("x{env:MISSING:-}y", { env: () => undefined })).toBe("xy");
  });

  it("applies the fallback even when no env resolver is provided", async () => {
    expect(await expandRefs("{env:ANY:-anon}", {})).toBe("anon");
  });

  it("works embedded in a larger string", async () => {
    expect(await expandRefs("Bearer {env:MISSING:-anon}", { env: () => undefined })).toBe(
      "Bearer anon",
    );
  });

  it("keeps an empty value when there is no fallback (pre-default behavior)", async () => {
    expect(await expandRefs("x{env:EMPTY}y", { env: () => "" })).toBe("xy");
  });

  it("does NOT apply default syntax to file/keychain — args are verbatim", async () => {
    const seenFiles: string[] = [];
    const seenKeychain: string[] = [];
    const out = await expandRefs("{file:/k:-x}", {
      file: (p) => {
        seenFiles.push(p);
        return p === "/k:-x" ? "filekey" : undefined;
      },
    });
    expect(out).toBe("filekey");
    expect(seenFiles).toEqual(["/k:-x"]);
    const kc = await expandRefs("{keychain:id:-x}", {
      keychain: (id) => {
        seenKeychain.push(id);
        return undefined; // no default fallback for keychain — value drops
      },
    });
    expect(kc).toBeUndefined();
    expect(seenKeychain).toEqual(["id:-x"]);
  });
});

describe("expandRecord (MCP headers/env)", () => {
  const resolvers = {
    env: (n: string) => (n === "TOKEN" ? "t0k3n" : undefined),
  };

  it("expands resolvable values and drops keys with unresolvable refs", async () => {
    const out = await expandRecord(
      {
        Authorization: "Bearer {env:TOKEN}",
        "Content-Type": "application/json",
        "X-Missing": "{env:NOPE}",
      },
      resolvers,
    );
    expect(out).toEqual({
      Authorization: "Bearer t0k3n",
      "Content-Type": "application/json",
    });
  });

  it("returns an empty record for an empty input", async () => {
    expect(await expandRecord({}, resolvers)).toEqual({});
  });
});
