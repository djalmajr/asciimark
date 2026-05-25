import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  plugins: [
    // hot: false disables solid-refresh (HMR) — pointless in a test run, and
    // under Bun 1.3.x the injected `@solid-refresh` virtual id gets fed to
    // fileURLToPath, throwing "argument 'filename' must be a file URL ...".
    solid({ hot: false }),
    // Mirrors the host apps' setup so `~icons/lucide/<name>` resolves to a
    // Solid component during tests. Without this, every component that
    // renders an icon would error during module evaluation.
    Icons({ compiler: "solid", autoInstall: false }),
  ],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    environment: "happy-dom",
    globals: false,
    // .vtest.{ts,tsx} is the Vitest-only marker. Bun's test runner picks up
    // .test.* and .spec.* anywhere in the workspace, which would otherwise
    // try to evaluate JSX as React. Keeping a distinct extension avoids that
    // collision without disabling Bun's default discovery.
    include: ["src/**/*.vtest.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/components/**/*.{ts,tsx}"],
      exclude: ["src/**/*.vtest.{ts,tsx}"],
    },
  },
});
