import path from "path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import Icons from "unplugin-icons/vite";

const ASCIIDOCTOR_CDN_HOST = "cdnjs.cloudflare.com";

interface BundleEntry {
  code?: string;
  fileName?: string;
  source?: string | Uint8Array;
  type?: string;
}

function hardenBundledJs(code: string): string {
  return code
    .replaceAll(ASCIIDOCTOR_CDN_HOST, "")
    .replaceAll("<script src=\"", "<x-script src=\"")
    .replaceAll("<script>", "<x-script>")
    .replaceAll("<\\/script>", "</x-script>")
    .replaceAll("</script>", "</x-script>");
}

function stripAsciidoctorHighlightJsCdn() {
  return {
    name: "strip-asciidoctor-highlightjs-cdn",
    generateBundle(_outputOptions: unknown, bundle: Record<string, BundleEntry>) {
      for (const entry of Object.values(bundle)) {
        if (entry.type === "chunk") {
          if (typeof entry.code === "string") {
            entry.code = hardenBundledJs(entry.code);
          }
          continue;
        }

        if (entry.fileName?.endsWith(".js") && typeof entry.source === "string") {
          entry.source = hardenBundledJs(entry.source);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    solidPlugin(),
    stripAsciidoctorHighlightJsCdn(),
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
  base: "./",
  build: {
    outDir: "dist",
    target: "esnext",
    rollupOptions: {
      input: {
        "new-tab": "index.html",
      },
    },
  },
});
