import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import {
  openDirectory,
  readTree,
  readFileContent,
  readFileByPath,
  resolveFileByPath,
  saveDirectoryHandle,
  loadDirectoryHandle,
  type FSEntry,
} from "../lib/fs.ts";
import { convertAdoc, getIncludePaths } from "../lib/asciidoc.ts";
import { FileWatcher } from "../lib/watcher.ts";
import { Toolbar } from "./Toolbar.tsx";
import { FileTree } from "./FileTree.tsx";
import { Preview } from "./Preview.tsx";
import { EmptyState } from "./EmptyState.tsx";

/** Get file path from URL hash. Hash format: #/path/to/file.adoc */
function getPathFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash || hash === "#") return null;
  // Strip leading #/ or #
  return hash.replace(/^#\/?/, "");
}

/** Set URL hash from file path */
function setHashFromPath(path: string | null) {
  if (path) {
    const newHash = `#/${path}`;
    if (window.location.hash !== newHash) {
      history.pushState(null, "", newHash);
    }
  } else {
    if (window.location.hash) {
      history.pushState(null, "", window.location.pathname);
    }
  }
}

/** Recursively find an FSEntry by its path in the tree */
function findEntryByPath(entries: FSEntry[], targetPath: string): FSEntry | null {
  for (const entry of entries) {
    if (entry.path === targetPath) return entry;
    if (entry.children) {
      const found = findEntryByPath(entry.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export function App() {
  const [rootHandle, setRootHandle] =
    createSignal<FileSystemDirectoryHandle | null>(null);
  const [tree, setTree] = createSignal<FSEntry[]>([]);
  const [selectedFile, setSelectedFile] = createSignal<FSEntry | null>(null);
  const [html, setHtml] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [autoRefresh, setAutoRefresh] = createSignal(true);
  const [sidebarWidth, setSidebarWidth] = createSignal(280);
  const [sidebarVisible, setSidebarVisible] = createSignal(true);
  const [tocVisible, setTocVisible] = createSignal(true);
  const [rootName, setRootName] = createSignal("");

  const watcher = new FileWatcher(() => {
    const file = selectedFile();
    if (file) loadFileContent(file);
  });

  onCleanup(() => watcher.destroy());

  // Try to restore saved directory handle on mount
  (async () => {
    const saved = await loadDirectoryHandle();
    if (saved) {
      try {
        const perm = await (saved as any).queryPermission({ mode: "read" });
        if (perm === "granted") {
          setRootHandle(saved);
          setRootName(saved.name);
          const entries = await readTree(saved);
          setTree(entries);

          // Restore file from URL hash
          const hashPath = getPathFromHash();
          if (hashPath) {
            const entry = findEntryByPath(entries, hashPath);
            if (entry && entry.kind === "file") {
              loadFileContent(entry);
            }
          }
        }
      } catch {
        // Permission denied or handle invalid
      }
    }
  })();

  // Handle browser back/forward navigation
  function onPopState() {
    const hashPath = getPathFromHash();
    if (hashPath) {
      const entry = findEntryByPath(tree(), hashPath);
      if (entry && entry.kind === "file") {
        loadFileContent(entry, false); // don't push to history
      }
    }
  }

  window.addEventListener("popstate", onPopState);
  onCleanup(() => window.removeEventListener("popstate", onPopState));

  // Toggle auto-refresh
  createEffect(() => {
    if (autoRefresh()) {
      watcher.start();
    } else {
      watcher.stop();
    }
  });

  async function handleOpenFolder() {
    try {
      const handle = await openDirectory();
      setRootHandle(handle);
      setRootName(handle.name);
      await saveDirectoryHandle(handle);
      setLoading(true);
      const entries = await readTree(handle);
      setTree(entries);
      setLoading(false);
      setSelectedFile(null);
      setHtml("");
      setHashFromPath(null);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Failed to open directory:", e);
      }
    }
  }

  async function loadFileContent(entry: FSEntry, pushHistory = true) {
    const root = rootHandle();
    if (!root || entry.kind !== "file") return;

    setSelectedFile(entry);
    setLoading(true);

    // Update URL hash
    if (pushHistory) {
      setHashFromPath(entry.path);
    }

    try {
      const content = await readFileContent(
        entry.handle as FileSystemFileHandle,
      );

      const readFile = (path: string) => readFileByPath(root, path);

      const result = await convertAdoc({
        filePath: entry.path,
        fileContent: content,
        readFile,
      });

      setHtml(result);

      // Update watcher target
      const baseDirPath = entry.path.includes("/")
        ? entry.path.substring(0, entry.path.lastIndexOf("/"))
        : "";
      const includePaths = getIncludePaths(content, baseDirPath);
      watcher.setTarget({
        fileHandle: entry.handle as FileSystemFileHandle,
        includePaths,
        rootHandle: root,
      });

      if (autoRefresh()) {
        watcher.start();
      }
    } catch (e) {
      console.error("Failed to convert file:", e);
      setHtml(`<div class="error">Error converting file: ${e}</div>`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Navigate to a file by its path (from xref link clicks).
   * The path may not be in the tree if it wasn't an .adoc file picked up by readTree,
   * so we also try resolving directly via the filesystem handle.
   */
  async function handleNavigate(targetPath: string) {
    const root = rootHandle();
    if (!root) return;

    // First, try to find it in the existing tree (fastest)
    const entry = findEntryByPath(tree(), targetPath);
    if (entry && entry.kind === "file") {
      loadFileContent(entry);
      return;
    }

    // Not in tree — resolve the file handle directly from the filesystem
    try {
      const fileHandle = await resolveFileByPath(root, targetPath);
      if (fileHandle) {
        // Create a synthetic FSEntry
        const name = targetPath.includes("/")
          ? targetPath.substring(targetPath.lastIndexOf("/") + 1)
          : targetPath;
        const syntheticEntry: FSEntry = {
          name,
          kind: "file",
          path: targetPath,
          handle: fileHandle,
        };
        loadFileContent(syntheticEntry);
        return;
      }
    } catch {
      // Fall through
    }

    console.warn(`File not found: ${targetPath}`);
  }

  function handleExportPdf() {
    window.print();
  }

  // Sidebar resize logic
  let resizing = false;

  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    resizing = true;

    const onMove = (ev: MouseEvent) => {
      if (!resizing) return;
      const newWidth = Math.max(180, Math.min(600, ev.clientX));
      setSidebarWidth(newWidth);
    };

    const onUp = () => {
      resizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div class="app">
      <Toolbar
        rootName={rootName()}
        fileName={selectedFile()?.name ?? null}
        filePath={selectedFile()?.path ?? null}
        autoRefresh={autoRefresh()}
        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
        sidebarVisible={sidebarVisible()}
        tocVisible={tocVisible()}
        onToggleSidebar={() => setSidebarVisible((v) => !v)}
        onToggleToc={() => setTocVisible((v) => !v)}
        onOpenFolder={handleOpenFolder}
        onExportPdf={handleExportPdf}
        hasFile={!!selectedFile()}
      />
      <div class="main">
        <Show when={rootHandle() && sidebarVisible()}>
          <aside class="sidebar" style={{ width: `${sidebarWidth()}px` }}>
            <FileTree
              entries={tree()}
              selectedPath={selectedFile()?.path ?? null}
              onSelect={(entry) => loadFileContent(entry)}
            />
          </aside>
          <div class="resize-handle" onMouseDown={onResizeStart} />
        </Show>
        <div class="content">
          <Show when={selectedFile()} fallback={<EmptyState hasRoot={!!rootHandle()} onOpenFolder={handleOpenFolder} />}>
            <Preview
              html={html()}
              loading={loading()}
              tocVisible={tocVisible()}
              currentFilePath={selectedFile()?.path ?? null}
              onNavigate={handleNavigate}
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
