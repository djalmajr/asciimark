// Desktop wrapper over the keychain IPC commands (DJA-11E). API keys live only
// in the OS secure store — this module is the only path the frontend uses to
// read/write them, and it never persists a key anywhere else.

import { invoke } from "./chaos-invoke.ts";

export async function setApiKey(providerId: string, key: string): Promise<void> {
  await invoke<void>("ai_set_api_key", { providerId, key });
}

export async function getApiKey(providerId: string): Promise<string | null> {
  return (await invoke<string | null>("ai_get_api_key", { providerId })) ?? null;
}

export async function deleteApiKey(providerId: string): Promise<void> {
  await invoke<void>("ai_delete_api_key", { providerId });
}

/** Whether a key is stored for the provider (drives the Settings "Saved"/"Not
 *  set" badge) — without returning the secret itself. */
export async function hasApiKey(providerId: string): Promise<boolean> {
  return (await getApiKey(providerId)) !== null;
}
