// Built-in provider catalog (engine-neutral; see config-schema.ts `kind`).
// The user's ai.json is deep-merged over this — known providers inherit
// kind/name/models and let the user override options (baseURL) and add models;
// local providers (Ollama) ship with no models so the user lists the ones they
// have installed. Mirrors the Figma "Manage providers" cards.

import type { AIConfig, ProviderConfig, UserAIConfig } from "./config-schema.ts";
import { mergeConfigs } from "./config-schema.ts";

export const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    kind: "anthropic",
    name: "Anthropic",
    models: {
      "claude-sonnet-4-6": {
        name: "Claude Sonnet 4.6",
        limit: { context: 200000, output: 64000 },
      },
      "claude-haiku-4-5": {
        name: "Claude Haiku 4.5",
        limit: { context: 200000, output: 64000 },
      },
    },
  },
  openai: {
    kind: "openai",
    name: "OpenAI",
    models: {
      "gpt-4o": { name: "GPT-4o", limit: { context: 128000, output: 16384 } },
      "gpt-4o-mini": {
        name: "GPT-4o mini",
        limit: { context: 128000, output: 16384 },
      },
    },
  },
  openrouter: {
    kind: "openai-compatible",
    name: "OpenRouter",
    options: { baseURL: "https://openrouter.ai/api/v1" },
    models: {}, // 200+ models — the user lists the ones they use
  },
  opencode: {
    kind: "openai-compatible",
    name: "OpenCode Zen",
    options: { baseURL: "https://opencode.ai/zen/go/v1" },
    models: {}, // fetched live from /models (see model-catalog.ts)
  },
  ollama: {
    kind: "openai-compatible",
    name: "Ollama (local)",
    options: { baseURL: "http://localhost:11434/v1" },
    models: {}, // the user lists installed models (e.g. "llama3.1:8b")
  },
};

/** Deep-merge a parsed user config over the built-in catalog. */
export function withBuiltins(user: UserAIConfig): AIConfig {
  return mergeConfigs(BUILTIN_PROVIDERS, user);
}
