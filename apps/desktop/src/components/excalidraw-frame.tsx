import { invoke } from "@tauri-apps/api/core";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
// @zomme/frame core (vendored): registers the <z-frame> custom element. Vendored
// instead of the npm dep because the published @zomme/frame ships an empty dist,
// and a file: dep stalls vite's dep scanner. Re-bundle from the frame repo with:
//   bun build ../../frame/packages/frame/src/frame.ts --outfile src/vendor/zomme-frame.js --target browser --format esm
import "../vendor/zomme-frame.js";

interface Scene {
  appState?: Record<string, unknown>;
  elements?: unknown[];
}

interface ExcalidrawFrameProps {
  /** Absolute path of the `.excalidraw` file on disk. */
  filePath: string;
}

function sceneToFile(scene: Scene): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "asciimark",
    appState: scene.appState ?? {},
    elements: scene.elements ?? [],
  });
}

/**
 * Embedded Excalidraw editor for a `.excalidraw` file, shown in the pane in place
 * of the markdown/asciidoc preview (caminho B). Desktop-only: the guest (the real
 * Excalidraw editor, apps/excalidraw-guest) runs in the <z-frame>'s iframe; this
 * host loads the file (`read_file`) into it and persists edits (`write_file`).
 *
 * The <z-frame> is created and driven IMPERATIVELY inside a host <div>, NOT as
 * JSX. If it lives in Solid's render tree, Solid reconciles the custom element's
 * own getters (e.g. `get src`) during insertion — which throws "Illegal
 * invocation" and leaves the iframe stuck (timeout). Keeping it out of the render
 * tree avoids that. All <z-frame> wiring (attributes, the `save` RPC method, the
 * `drawingData` push) is done by hand here.
 *
 * Persistence lives in the HOST, not the iframe: the guest pushes its scene on
 * every coalesced change via `save`; we debounce the disk write and FLUSH on
 * cleanup (which runs while the iframe is alive, before a tab switch/unmount), so
 * the last edit isn't lost.
 */
export function ExcalidrawFrame(props: ExcalidrawFrameProps) {
  let host: HTMLDivElement | undefined;
  // The <z-frame> element; `any` because it's a custom element with dynamic props.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let zframe: any;
  const [scene, setScene] = createSignal<Scene | undefined>(undefined);
  const [frameReady, setFrameReady] = createSignal(false);
  let latest: Scene | undefined;
  let writeTimer: ReturnType<typeof setTimeout> | undefined;

  const writeNow = (path: string, s: Scene) => {
    void invoke("write_file", { path, content: sceneToFile(s) });
  };

  // Called by the guest (RPC) on every coalesced change. Keep the latest scene
  // and debounce the disk write; onCleanup flushes whatever is pending.
  const save = async (s: Scene) => {
    latest = s;
    const path = props.filePath;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = undefined;
      writeNow(path, s);
    }, 400);
    return { ok: true };
  };

  onMount(() => {
    zframe = document.createElement("z-frame");
    // Set everything BEFORE appendChild so the iframe is created once, with the
    // right attributes/props — no "sandbox changed - recreate" churn.
    zframe.setAttribute("name", "excalidraw");
    zframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    // @zomme/frame builds the iframe URL as `src + pathname`: `src` is the
    // ORIGIN only and `pathname` is the route within it. `src` must be absolute
    // (it runs `new URL(src).origin` for the postMessage handshake, which throws
    // on a relative URL). Putting the whole path in `src` makes it append the
    // default pathname "/" → ".../editor.html/", which vite's SPA fallback
    // serves as the host app's index.html (the "home screen" bug) instead of the
    // guest. editor.html (not index.html) keeps it out of vite's HTML-entry scan
    // (the 1.3 MB bundle would exhaust file handles — EMFILE).
    zframe.setAttribute("src", window.location.origin);
    zframe.setAttribute("pathname", "/excalidraw/editor.html");
    zframe.style.cssText = "width:100%;height:100%;border:0;display:block";
    zframe.save = save; // forwarded to the guest as an RPC method
    host?.appendChild(zframe);
    setFrameReady(true);
  });

  // (Re)load when the target file changes; flush the previous file's latest edit
  // before switching (and on unmount) via the effect's onCleanup.
  createEffect(() => {
    const path = props.filePath;
    setScene(undefined);
    latest = undefined;
    invoke<string>("read_file", { path })
      .then((content) => {
        const json = JSON.parse(content) as Scene;
        setScene({ appState: json.appState ?? {}, elements: json.elements ?? [] });
      })
      .catch(() => {
        setScene({ appState: {}, elements: [] });
      });

    onCleanup(() => {
      clearTimeout(writeTimer);
      writeTimer = undefined;
      if (latest) writeNow(path, latest);
    });
  });

  // Push the loaded scene to the guest once both the frame and the scene exist.
  createEffect(() => {
    const s = scene();
    if (frameReady() && zframe && s) {
      zframe.drawingData = { appState: s.appState ?? {}, elements: s.elements ?? [] };
    }
  });

  onCleanup(() => {
    zframe?.remove();
  });

  return <div ref={host} style="width:100%;height:100%" />;
}
