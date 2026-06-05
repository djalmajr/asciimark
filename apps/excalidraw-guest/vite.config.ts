import { cpSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Excalidraw ships its fonts/locales/worker under dist/excalidraw-assets. Resolve
// the installed package dir (bun's flat .bun layout, so resolve the manifest).
const excalidrawDist = dirname(
  createRequire(import.meta.url).resolve("@excalidraw/excalidraw/package.json"),
);
const excalidrawAssets = resolve(excalidrawDist, "dist/excalidraw-assets");
const guestOutDir = resolve(__dirname, "../desktop/public/excalidraw");

// The Excalidraw editor guest, embedded by the desktop app via <z-frame>.
// Built into the desktop app's public dir so Tauri serves it at /excalidraw/
// (no external dev server needed). See apps/desktop/src/components/excalidraw-frame.tsx.
//
// The entry is `editor.html`, NOT `index.html`, on purpose: the desktop's vite dev
// server treats any `index.html` under its public dir as an HTML entry and tries to
// scan the 1.3 MB Excalidraw bundle, exhausting Windows file handles (EMFILE).
// A non-index name is ignored by that scan and served as a plain static asset.
export default defineConfig({
  base: "/excalidraw/",
  // Excalidraw checks process.env.IS_PREACT; define it so the bundle doesn't break.
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  optimizeDeps: {
    exclude: ["@zomme/frame", "@zomme/frame-react"],
  },
  plugins: [
    react(),
    // The guest is loaded in a same-origin iframe served by the desktop app; the
    // `crossorigin` attribute vite adds to module scripts can stall that iframe's
    // load in WebView2. Strip it — same-origin doesn't need it.
    {
      name: "strip-crossorigin",
      enforce: "post" as const,
      transformIndexHtml(html: string) {
        return html.replace(/ crossorigin/g, "");
      },
    },
    // Copy Excalidraw's fonts/assets into the guest dir so the editor serves them
    // locally (window.EXCALIDRAW_ASSET_PATH in editor.html) instead of unpkg.
    // closeBundle runs after emptyOutDir wipes the dir, so the copy survives.
    {
      name: "copy-excalidraw-assets",
      closeBundle() {
        cpSync(excalidrawAssets, resolve(guestOutDir, "excalidraw-assets"), {
          recursive: true,
        });
      },
    },
  ],
  build: {
    outDir: guestOutDir,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "editor.html"),
    },
  },
});
