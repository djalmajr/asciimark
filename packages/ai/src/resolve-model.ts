// Resolve a "provider/model-id" string against an AIConfig into the concrete
// provider + model config the adapter needs. Pure and engine-agnostic.

import type { AIConfig, ModelConfig, ProviderConfig } from "./config-schema.ts";

export interface ResolvedModel {
  /** The original "provider/model" id. */
  id: string;
  providerId: string;
  /** Model id within the provider — may itself contain slashes (e.g. OpenRouter
   *  "moonshotai/kimi-k2"), since only the FIRST slash splits provider/model. */
  modelId: string;
  provider: ProviderConfig;
  model: ModelConfig;
}

/** Split "provider/model" on the first slash. Returns null when either side is
 *  empty (no slash, leading slash, or trailing slash). */
export function parseModelId(
  id: string,
): { providerId: string; modelId: string } | null {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash >= id.length - 1) return null;
  return { providerId: id.slice(0, slash), modelId: id.slice(slash + 1) };
}

/** Resolve an id against the config, or null if the provider/model is unknown
 *  or the id is malformed/absent. */
export function resolveModel(
  config: AIConfig,
  id: string | undefined,
): ResolvedModel | null {
  if (!id) return null;
  const parsed = parseModelId(id);
  if (!parsed) return null;
  const provider = config.provider[parsed.providerId];
  if (!provider) return null;
  const model = provider.models[parsed.modelId];
  if (!model) return null;
  return {
    id,
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    provider,
    model,
  };
}

/** The configured default chat model (`config.model`), or null if unset/unknown. */
export function resolveDefaultModel(config: AIConfig): ResolvedModel | null {
  return resolveModel(config, config.model);
}

/** The model for lightweight tasks (`config.small_model`), falling back to the
 *  main model. Null if neither resolves. */
export function resolveSmallModel(config: AIConfig): ResolvedModel | null {
  return resolveModel(config, config.small_model ?? config.model);
}
