import type { FSEntry, WorkspaceRoot } from "./types.ts";

/**
 * A flat workspace file ready to be ranked. Pairs a file's `path` with the
 * `rootId` it belongs to so the Quick Open overlay can disambiguate two
 * roots that contain a file with the same basename.
 */
export interface IndexedFile {
  rootId: string;
  rootName: string;
  /** Relative path from the root, with `/` separators. */
  path: string;
  /** Last segment of `path`. */
  name: string;
  /** Path with the basename stripped. Empty string when the file lives at the root. */
  parentDir: string;
}

/**
 * Walk every `WorkspaceRoot` and emit one `IndexedFile` per `kind: "file"`
 * entry. Directories are skipped — the Quick Open palette only opens files.
 *
 * Pure: no I/O, no Tauri, no DOM. Caller passes the already-loaded tree.
 */
export function flattenWorkspace(roots: readonly WorkspaceRoot[]): IndexedFile[] {
  const out: IndexedFile[] = [];
  for (const root of roots) {
    walk(root.entries, root.id, root.name, out);
  }
  return out;
}

function walk(
  entries: readonly FSEntry[],
  rootId: string,
  rootName: string,
  out: IndexedFile[],
): void {
  for (const entry of entries) {
    if (entry.kind === "file") {
      const slash = entry.path.lastIndexOf("/");
      out.push({
        rootId,
        rootName,
        path: entry.path,
        name: entry.name,
        parentDir: slash >= 0 ? entry.path.slice(0, slash) : "",
      });
    } else if (entry.kind === "directory" && entry.children) {
      walk(entry.children, rootId, rootName, out);
    }
  }
}
