export interface FSEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
  /** Handle is available in native folder mode, absent in URL mode and fallback mode */
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  /** File object available in fallback mode (input webkitdirectory) */
  file?: File;
  children?: FSEntry[];
}

/** A workspace root folder. Desktop uses absolute path as id, extension uses handle.name. */
export interface WorkspaceRoot {
  collapsed: boolean;
  entries: FSEntry[];
  id: string;
  name: string;
}

/** A file path qualified by its workspace root id. */
export interface QualifiedPath {
  path: string;
  rootId: string;
}
