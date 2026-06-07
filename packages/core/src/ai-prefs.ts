// Lightweight, UI-facing AI preferences persisted in localStorage — the
// *selection* (which engine, which model, which indexing tier), kept separate
// from the heavier provider catalog (packages/ai). Mirrors editor-prefs.ts.
//
// Per the M1 decisions: no default model (empty until the user configures a
// provider), default indexing tier "lite" (ADR-002), default engine "ai-sdk".

/** Indexing tier (ADR-002). Logic is M2; M1 only persists/shows the choice. */
type IndexingTier = "off" | "lite" | "full";

/** Which SDK speaks to providers. Mirrors `AIEngineId` in `@asciimark/ai`
 *  (duplicated here so core stays free of an ai dependency — core is the base
 *  package that ai itself depends on). */
type AIEngineId = "ai-sdk" | "tanstack";

const ENGINE_KEY = "asciimark-ai-engine";
const MODEL_KEY = "asciimark-ai-model";
const SMALL_MODEL_KEY = "asciimark-ai-small-model";
const TIER_KEY = "asciimark-ai-indexing-tier";
const STREAMING_KEY = "asciimark-ai-streaming";

function getStoredAiEngine(): AIEngineId {
  return localStorage.getItem(ENGINE_KEY) === "tanstack" ? "tanstack" : "ai-sdk";
}

function setStoredAiEngine(engine: AIEngineId): void {
  localStorage.setItem(ENGINE_KEY, engine);
}

/** Selected chat model as a "provider/model" id, or null when unconfigured
 *  (the M1 default — the panel/Settings prompt the user to pick one). */
function getStoredAiModel(): string | null {
  return localStorage.getItem(MODEL_KEY);
}

function setStoredAiModel(modelId: string | null): void {
  if (modelId === null) localStorage.removeItem(MODEL_KEY);
  else localStorage.setItem(MODEL_KEY, modelId);
}

/** Selected model for lightweight tasks, or null to fall back to the main model. */
function getStoredAiSmallModel(): string | null {
  return localStorage.getItem(SMALL_MODEL_KEY);
}

function setStoredAiSmallModel(modelId: string | null): void {
  if (modelId === null) localStorage.removeItem(SMALL_MODEL_KEY);
  else localStorage.setItem(SMALL_MODEL_KEY, modelId);
}

function getStoredIndexingTier(): IndexingTier {
  const stored = localStorage.getItem(TIER_KEY);
  if (stored === "off" || stored === "full") return stored;
  return "lite"; // ADR-002: Lite (BM25) is the recommended default
}

function setStoredIndexingTier(tier: IndexingTier): void {
  localStorage.setItem(TIER_KEY, tier);
}

/** Whether to use the streaming engine path (real incremental deltas) instead
 *  of the buffered + fake-typing default. Default false (opt-in beta) until the
 *  WKWebView SSE behaviour is validated; the buffered path is the kill-switch. */
function getStoredAiStreaming(): boolean {
  return localStorage.getItem(STREAMING_KEY) === "true";
}

function setStoredAiStreaming(enabled: boolean): void {
  localStorage.setItem(STREAMING_KEY, enabled ? "true" : "false");
}

export type { AIEngineId, IndexingTier };
export {
  getStoredAiEngine,
  getStoredAiModel,
  getStoredAiSmallModel,
  getStoredAiStreaming,
  getStoredIndexingTier,
  setStoredAiEngine,
  setStoredAiModel,
  setStoredAiSmallModel,
  setStoredAiStreaming,
  setStoredIndexingTier,
};
