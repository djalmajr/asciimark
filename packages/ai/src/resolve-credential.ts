// Resolve a provider's API credential with the opencode precedence:
//   1. conventional environment variable (e.g. ANTHROPIC_API_KEY)
//   2. OS keychain / secure storage (host-provided)
//   3. config `options.apiKey`, expanding {env:VAR} / {file:path} /
//      {keychain:id} refs — whole-string OR embedded ("Bearer {env:TOKEN}") —
//      else literal. `{env:VAR:-fallback}` supplies a default when VAR is
//      unset or empty (env only; file paths and keychain ids are verbatim).
//      If ANY ref in a value fails to resolve the whole value is dropped, so
//      a literal placeholder is never sent as a credential.
//
// Pure and runtime-agnostic: the host injects how to read env vars, the
// keychain, and files (`HostResolvers`). On desktop these map to process env,
// the keyring IPC commands, and a file read; the extension supplies stubs.

import type { ProviderConfig } from "./config-schema.ts";

/** Host-provided resolvers. Any may be omitted (e.g. the browser has no env). */
export interface HostResolvers {
  /** Read an environment variable by name. */
  env?: (name: string) => string | undefined | Promise<string | undefined>;
  /** Read the stored key for a provider from the OS keychain / secure storage. */
  keychain?: (
    providerId: string,
  ) => string | undefined | Promise<string | undefined>;
  /** Read a file's contents (for `{file:path}` expansion). */
  file?: (path: string) => string | undefined | Promise<string | undefined>;
}

/** Conventional env var names checked first, per provider id. */
const CONVENTIONAL_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/**
 * Resolve the API key for `providerId`, or `undefined` when none is available.
 * Never throws on a missing credential — callers decide how to surface that
 * (e.g. an `auth` error in the UI).
 */
export async function resolveCredential(
  providerId: string,
  provider: ProviderConfig,
  resolvers: HostResolvers,
): Promise<string | undefined> {
  // 1. conventional env var
  const envName = CONVENTIONAL_ENV[providerId];
  if (envName && resolvers.env) {
    const fromEnv = await resolvers.env(envName);
    if (fromEnv) return fromEnv;
  }
  // 2. keychain / secure storage
  if (resolvers.keychain) {
    const fromKeychain = await resolvers.keychain(providerId);
    if (fromKeychain) return fromKeychain;
  }
  // 3. config options.apiKey — same ref expansion as MCP headers/env: whole-
  //    string refs behave exactly as before, and embedded refs / {keychain:} /
  //    {env:VAR:-fallback} now work too. An unresolvable ref yields undefined
  //    (a literal "{env:...}" placeholder is never used as a key).
  const apiKey = provider.options?.apiKey;
  if (apiKey) return expandRefs(apiKey, resolvers);
  return undefined;
}

/** All ref kinds, matched anywhere in a string (supports embedded refs like
 *  `Bearer {env:TOKEN}`). Neither a ref arg nor a default may contain `}`. */
const REF_GLOBAL = /\{(env|file|keychain):([^}]+)\}/g;

/** Split `{env:VAR:-fallback}` shell-style default syntax: the fallback (which
 *  may be empty) applies when VAR is unset OR empty, mirroring `${VAR:-x}`.
 *  ENV ONLY — file paths and keychain ids may legitimately contain `:-`, so
 *  their args are taken verbatim and have no default syntax. */
function splitEnvDefault(arg: string): { fallback?: string; name: string } {
  const sep = arg.indexOf(":-");
  if (sep === -1) return { name: arg };
  return { fallback: arg.slice(sep + 2), name: arg.slice(0, sep) };
}

async function resolveRef(
  kind: string,
  arg: string,
  resolvers: HostResolvers,
): Promise<string | undefined> {
  if (kind === "env") {
    const { fallback, name } = splitEnvDefault(arg);
    const value = resolvers.env ? ((await resolvers.env(name)) ?? undefined) : undefined;
    // Without a fallback an empty value passes through unchanged (byte-compat
    // with the pre-default behavior); with one, empty counts as unset (`:-`).
    if (fallback !== undefined && !value) return fallback;
    return value;
  }
  if (kind === "file") {
    const contents = resolvers.file ? await resolvers.file(arg) : undefined;
    return contents?.trim() || undefined;
  }
  if (kind === "keychain") {
    return resolvers.keychain ? ((await resolvers.keychain(arg)) ?? undefined) : undefined;
  }
  return undefined;
}

/**
 * Expand every `{env:VAR}` / `{file:path}` / `{keychain:id}` reference in a
 * string, including embedded ones (`Bearer {env:TOKEN}`). Env refs may carry a
 * default — `{env:VAR:-fallback}` — used when VAR is unset or empty. Returns
 * `undefined` if ANY referenced secret can't be resolved, so callers drop an
 * incomplete value rather than send a literal placeholder. A string with no
 * refs is returned unchanged.
 */
export async function expandRefs(
  value: string,
  resolvers: HostResolvers,
): Promise<string | undefined> {
  const matches = [...value.matchAll(REF_GLOBAL)];
  if (matches.length === 0) return value; // literal
  const resolved = new Map<string, string>();
  for (const m of matches) {
    const full = m[0];
    if (resolved.has(full)) continue;
    const refValue = await resolveRef(m[1]!, m[2]!, resolvers);
    if (refValue === undefined) return undefined; // incomplete — drop the whole value
    resolved.set(full, refValue);
  }
  return value.replace(REF_GLOBAL, (full) => resolved.get(full) ?? full);
}

/**
 * Expand refs across a record's values (e.g. MCP `headers` / `env`). Keys whose
 * value contains an unresolvable ref are DROPPED, so a literal `{env:...}`
 * placeholder never reaches the server. Resolved at connect time, in memory —
 * secrets never touch `ai.json`.
 */
export async function expandRecord(
  record: Record<string, string>,
  resolvers: HostResolvers,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const resolved = await expandRefs(value, resolvers);
    if (resolved !== undefined) out[key] = resolved;
  }
  return out;
}
