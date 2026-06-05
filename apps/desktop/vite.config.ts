import path from "path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    solidPlugin(),
    tailwindcss(),
    Icons({
      compiler: "solid",
      autoInstall: false,
    }),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@asciimark/core": path.resolve(__dirname, "../../packages/core/src"),
      "@asciimark/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  clearScreen: false,
  optimizeDeps: {
    // Scan ONLY the app entry. Otherwise vite's dep scanner globs every *.html
    // under the root — including apps/desktop/src-tauri/target/doc (the `cargo doc`
    // output, ~24k typenum .html files), which exhausts Windows file descriptors and
    // breaks `tauri dev` with EMFILE / a hung optimizer. Intermittent because
    // target/doc only exists after `cargo doc`. NOTE: server.watch.ignored does NOT
    // affect the dep scanner — this `entries` cap is what keeps it out of target/.
    entries: ["index.html"],
  },
  server: {
    port: 2444,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host ? { protocol: "ws", host, port: 2445 } : undefined,
    watch: {
      // Re-include vite's defaults (node_modules, .git): a custom `ignored`
      // replaces them, and watching node_modules — now bloated by the excalidraw
      // guest's deps — blows the Windows file-handle limit (EMFILE). Also skip the
      // guest's build output (it's regenerated, not edited).
      ignored: [
        "**/src-tauri/**",
        "**/node_modules/**",
        "**/.git/**",
        "**/public/excalidraw/**",
      ],
    },
  },
  build: {
    outDir: "dist",
    target: "esnext",
  },
});
