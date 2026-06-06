/**
 * Pure workspace-path helpers for create/move operations. No Tauri/IO deps so
 * they stay unit-testable in isolation.
 */

/** Join a workspace-relative parent dir and a child name (no leading slash;
 *  a trailing slash on the parent is collapsed). */
export function joinRelative(parentRel: string, name: string): string {
  const p = parentRel.replace(/\/+$/, "");
  return p ? `${p}/${name}` : name;
}

/** Default a name to `.md` when its basename carries no extension. Names like
 *  `data.json` or `sub/notes.md` are left as-is; `notas` → `notas.md`. */
export function withDefaultExtension(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  return base.includes(".") ? name : `${name}.md`;
}
