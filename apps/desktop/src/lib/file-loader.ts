import type { Accessor } from "solid-js";
import type { FSEntry } from "@asciimark/core/types.ts";
import { getIncludePaths } from "@asciimark/core/asciidoc.ts";
import { getMarkdownIncludePaths } from "@asciimark/core/markdown.ts";
import { isMdFile, isSupportedFile } from "@asciimark/core/utils.ts";
import type { AppState } from "@asciimark/ui/composables/create-app-state.ts";
import {
  readFileByPath,
  readFileContent,
  readFilesRelative,
} from "./fs.ts";
import type { FileWatcher } from "./watcher.ts";

interface FileLoaderDeps {
  rootPaths: Accessor<Map<string, string>>;
  state: AppState;
  watcher: FileWatcher;
}

export function createFileLoader(deps: FileLoaderDeps) {
  const { rootPaths, state, watcher } = deps;

  async function loadFileContent(entry: FSEntry, pushHistory = true, force = false, rootId?: string) {
    // Pin the target pane at call time. AppState's per-doc setters
    // (setHtml, setEditorContent, …) are proxies that route to
    // `paneManager.activePane()` on each call — without pinning, a
    // pane switch between this function's await points would route
    // the convert result to the wrong pane (the original symptom:
    // "intro.adoc shows blank preview" when the user clicked another
    // pane mid-conversion). Writing directly to the captured pane
    // keeps the load atomic from the user's perspective: the file
    // they asked for lands where they asked for it.
    const targetPane = state.paneManager.activePane();
    const targetRootId = rootId ?? targetPane.selectedRootId();
    const root = targetRootId ? rootPaths().get(targetRootId) : null;
    if (!root || entry.kind !== "file") return;
    const isSameFile =
      targetPane.selectedFile()?.path === entry.path
      && targetPane.selectedRootId() === targetRootId;
    if (!force && isSameFile) return;

    targetPane.setSelectedRootId(targetRootId);
    targetPane.setSelectedFile(entry);
    if (!isSameFile) {
      targetPane.setHtml("");
    }
    targetPane.setLoading(true);

    if (pushHistory) {
      // Nav stack lives on AppState (global) — same handler whether
      // we're pinning the pane or not.
      state.pushNavHistory({
        entry,
        rootId: targetRootId!,
      });
    }

    // Yield to let the UI render loading state before heavy conversion
    await new Promise((r) => setTimeout(r, 0));

    try {
      const absolutePath = `${root}/${entry.path}`;
      const content = await readFileContent(absolutePath);

      // Non-previewable formats (json, txt, yaml, …) skip conversion entirely
      // and open straight in the editor. The createEffect in app state forces
      // editor mode to "edit" because previewSupported() turns false.
      if (!isSupportedFile(entry.path)) {
        targetPane.setHtml("");
        targetPane.setFrontmatter(null);
        targetPane.setEditorContent(content);
        targetPane.setSavedContent(content);
        watcher.setTarget({ filePath: absolutePath, includePaths: [], rootPath: root });
        if (state.autoRefresh()) watcher.start();
        return;
      }

      // Pre-scan include paths and batch-read them in a single IPC call
      const baseDirForIncludes = entry.path.includes("/")
        ? entry.path.substring(0, entry.path.lastIndexOf("/"))
        : "";
      const scanPaths = isMdFile(entry.path)
        ? getMarkdownIncludePaths(content, baseDirForIncludes)
        : getIncludePaths(content, baseDirForIncludes);

      let includeFileCache: Map<string, string> | null = null;
      if (scanPaths.length > 0) {
        includeFileCache = await readFilesRelative(root, scanPaths);
      }

      const readFile = includeFileCache
        ? (relPath: string) => Promise.resolve(includeFileCache!.get(relPath) ?? null)
        : (relPath: string) => readFileByPath(root, relPath);

      state._readFile = readFile;

      const result = await state.convert(entry.path, content, readFile);

      // Yield again before DOM update to prevent long frame
      await new Promise((r) => setTimeout(r, 0));

      targetPane.setHtml(result.html);
      targetPane.setFrontmatter(result.frontmatter);
      targetPane.setEditorContent(content);
      targetPane.setSavedContent(content);

      const baseDirPath = entry.path.includes("/")
        ? entry.path.substring(0, entry.path.lastIndexOf("/"))
        : "";
      const includePaths = isMdFile(entry.path)
        ? getMarkdownIncludePaths(content, baseDirPath)
        : getIncludePaths(content, baseDirPath);

      watcher.setTarget({
        filePath: absolutePath,
        includePaths,
        rootPath: root,
      });

      if (state.autoRefresh()) {
        watcher.start();
      }
    } catch (e) {
      console.error("Failed to convert file:", e);
      targetPane.setHtml(`<div class="error">Error converting file: ${e}</div>`);
    } finally {
      targetPane.setLoading(false);
    }
  }

  return { loadFileContent };
}
