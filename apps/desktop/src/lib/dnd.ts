import { onCleanup, onMount } from "solid-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { FSEntry } from "@asciimark/core/types.ts";
import { isSupportedFile } from "@asciimark/core/utils.ts";
import type { AppState } from "@asciimark/ui/composables/create-app-state.ts";
import { readTree } from "./fs.ts";

interface TauriDndDeps {
  addRoot: (path: string) => Promise<boolean>;
  loadFileContent: (entry: FSEntry, pushHistory?: boolean, force?: boolean, rootId?: string) => Promise<void>;
  state: AppState;
}

export function setupTauriDnd(deps: TauriDndDeps) {
  const { addRoot, loadFileContent, state } = deps;

  onMount(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent(async (event) => {
      console.log("[dnd]", event.payload.type, event.payload);
      if (event.payload.type === "over") {
        state.setDragOver(true);
      } else if (event.payload.type === "leave") {
        state.setDragOver(false);
      } else if (event.payload.type === "drop") {
        state.setDragOver(false);
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) {
          console.warn("[dnd] drop event with no paths");
          return;
        }

        const droppedPath = paths[0];
        console.log("[dnd] processing drop:", droppedPath);
        try {
          // Try reading as directory first
          const entries = await readTree(droppedPath, state.showHiddenEntries());
          console.log("[dnd] readTree succeeded, entries:", entries.length);
          if (entries.length > 0) {
            await addRoot(droppedPath);
            return;
          }
        } catch (e) {
          console.warn("[dnd] readTree failed:", e);
          // Not a directory or empty, try as file
        }

        // Handle as single file -- use its parent directory as root
        const normalized = droppedPath.replace(/\\/g, "/");
        const fileName = normalized.split("/").pop() ?? droppedPath;
        if (isSupportedFile(fileName)) {
          const parentDir = normalized.substring(0, normalized.lastIndexOf("/"));
          const opened = await addRoot(parentDir);
          if (opened) {
            const entry: FSEntry = { name: fileName, kind: "file", path: fileName };
            state.pushRecentFile({
              entry,
              rootName: state.rootName(),
              rootPath: parentDir,
            });
            await loadFileContent(entry, true, false, parentDir);
          }
        }
      }
    });

    onCleanup(() => {
      unlisten.then((fn) => fn());
    });
  });
}
