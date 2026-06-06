// Fetch the live model list from an OpenAI-compatible provider's `/models`
// endpoint (DJA-11F / DJA-15). Drives the model <select> in Settings so the user
// picks from what the provider actually offers, instead of a hardcoded list.

export interface CatalogModel {
  id: string;
  name?: string;
}

/**
 * GET `<baseURL>/models` (OpenAI shape: `{ data: [{ id }] }`). Returns the model
 * ids. Throws on a non-OK response so the caller can surface auth/network errors.
 */
export async function fetchModels(
  baseURL: string,
  apiKey?: string,
  headers?: Record<string, string>,
  /** Custom fetch (e.g. Tauri HTTP plugin) to dodge webview CORS; defaults to
   *  the global fetch. */
  fetchImpl: typeof globalThis.fetch = fetch,
): Promise<CatalogModel[]> {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const res = await fetchImpl(url, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to list models (${res.status} ${res.statusText})`);
  }
  const json = (await res.json()) as {
    data?: Array<{ id?: string; name?: string }>;
  };
  return (json.data ?? [])
    .filter((m): m is { id: string; name?: string } => typeof m.id === "string")
    .map((m) => ({ id: m.id, name: m.name }));
}
