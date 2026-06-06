// Resolve a provider's API credential with the opencode precedence:
//   1. conventional environment variable (e.g. ANTHROPIC_API_KEY)
//   2. OS keychain / secure storage (host-provided)
//   3. config `options.apiKey`, expanding {env:VAR} / {file:path}, else literal
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

const ENV_REF = /^\{env:([^}]+)\}$/;
const FILE_REF = /^\{file:([^}]+)\}$/;

async function expand(
  value: string,
  resolvers: HostResolvers,
): Promise<string | undefined> {
  const envRef = ENV_REF.exec(value);
  if (envRef) {
    return resolvers.env ? ((await resolvers.env(envRef[1])) ?? undefined) : undefined;
  }
  const fileRef = FILE_REF.exec(value);
  if (fileRef) {
    const contents = resolvers.file ? await resolvers.file(fileRef[1]) : undefined;
    return contents?.trim() || undefined;
  }
  return value; // literal
}

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
  // 3. config options.apiKey ({env:}/{file:} reference or literal)
  const apiKey = provider.options?.apiKey;
  if (apiKey) return expand(apiKey, resolvers);
  return undefined;
}
