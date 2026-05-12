// Per-key localStorage preferences scoped to the workspace file tree.
// Mirrors the shape of `editor-prefs.ts` — one key per preference,
// no Valibot for simple booleans/enums (Valibot stays reserved for
// multi-field bags like `font-prefs.ts`).
//
// The single difference from `editor-prefs.getStoredBoolean` is that
// invalid stored values fall back to the configured default instead
// of always to `false`. The editor-prefs convention works for prefs
// whose default is `false`; here the default is `true` (most
// workspaces benefit from gitignore filtering) so we need the
// stricter parse to keep "corrupt input → default" honest.

const RESPECT_GITIGNORE_KEY = "asciimark-file-tree-respect-gitignore";

function getStoredStrictBoolean(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultValue;
}

function getStoredRespectGitignore(): boolean {
  return getStoredStrictBoolean(RESPECT_GITIGNORE_KEY, true);
}

function setStoredRespectGitignore(enabled: boolean): void {
  localStorage.setItem(RESPECT_GITIGNORE_KEY, String(enabled));
}

export { getStoredRespectGitignore, setStoredRespectGitignore };
