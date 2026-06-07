// Engine abstraction — the swappable implementation behind the AIProvider
// contract. The contract (types.ts) is identical regardless of engine; an
// engine only decides *how* the bytes reach the provider's API.
//
// Two engines are planned and interchangeable (the user can switch without any
// UI change):
//   - "ai-sdk"   → Vercel AI SDK (streamText) running in the webview. Maps a
//                  provider `kind` to "@ai-sdk/anthropic" | "@ai-sdk/openai" |
//                  "@ai-sdk/openai-compatible".
//   - "tanstack" → TanStack AI core (chat()) via a custom in-process transport
//                  (no server). Maps `kind` to the matching "@tanstack/ai-*".
//
// Concrete engines live in engines/ and are loaded lazily by adapter.ts.

import type { ResolvedModel } from "./resolve-model.ts";
import type { AIProvider } from "./types.ts";

export type AIEngineId = "ai-sdk" | "tanstack";

/** Resolves the provider's API key just-in-time. Called inside `chat()` right
 *  before the request so the key is never held longer than necessary (it lives
 *  in the OS keychain; see resolve-credential.ts). Returns undefined when no
 *  credential is configured. */
export type CredentialResolver = () => Promise<string | undefined>;

/** A `fetch`-compatible implementation. On desktop the host injects the
 *  Tauri HTTP plugin's fetch so requests go through Rust and avoid the
 *  WKWebView CORS wall; in tests/extension the global fetch is used. */
export type FetchImpl = typeof globalThis.fetch;

export interface AIEngineOptions {
  /** Custom fetch (e.g. Tauri HTTP plugin) to dodge webview CORS. */
  fetch?: FetchImpl;
  /** Use `streamText` (real incremental deltas) instead of the buffered
   *  `generateText` + fake-typing path. Default false: whether the injected
   *  fetch surfaces SSE incrementally in the WKWebView is unverified (the A0
   *  spike), so streaming stays opt-in and the buffered path is the safe
   *  default + kill-switch. */
  streaming?: boolean;
}

/** Builds a concrete `AIProvider` for a resolved model. The implementation
 *  reads `resolved.provider.kind` to pick the right SDK family and uses
 *  `resolved.provider.options` (baseURL/headers) + the resolved credential. */
export interface AIEngine {
  readonly id: AIEngineId;
  createProvider(
    resolved: ResolvedModel,
    getApiKey: CredentialResolver,
    opts?: AIEngineOptions,
  ): AIProvider;
}
