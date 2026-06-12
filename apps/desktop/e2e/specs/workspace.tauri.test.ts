// Backend contract test. Drives the running `tauri dev` instance through
// the MCP bridge's `execute_js` capability — invokes our own commands via
// `window.__TAURI_INTERNALS__.invoke` from inside the webview.
//
// Skipped automatically when the bridge port is not reachable so devs who
// don't have `tauri dev` running locally don't see noisy failures.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { connectBridge, type Bridge } from "../bridge.ts";

const FIXTURE = resolve(import.meta.dir, "../fixtures/sample-workspace");
let bridge: Bridge | null = null;

// The hidden/bulky-directory assertions need a `.git` and a `node_modules`
// INSIDE the fixture — neither can be committed (git refuses nested .git
// dirs, node_modules is ignored), so they are created ephemerally here and
// removed afterwards. Only what this run created is cleaned up.
const EPHEMERAL_DIRS = [".git", "node_modules"];
const createdDirs: string[] = [];

beforeAll(async () => {
  for (const name of EPHEMERAL_DIRS) {
    const dir = resolve(FIXTURE, name);
    const exists = await stat(dir).then(
      () => true,
      () => false,
    );
    if (!exists) {
      await mkdir(dir, { recursive: true });
      createdDirs.push(dir);
    }
  }
  try {
    bridge = await connectBridge();
  } catch (err) {
    console.warn(
      `[e2e] tauri-mcp-bridge unreachable — skipping (start \`bun run dev:app\` to enable). Error: ${(err as Error).message}`,
    );
  }
});

afterAll(async () => {
  bridge?.close();
  for (const dir of createdDirs) {
    await rm(dir, { force: true, recursive: true });
  }
});

interface DirEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
  children?: DirEntry[];
}

describe("desktop IPC contract", () => {
  it("read_dir returns a tree without bulky/hidden directories", async () => {
    if (!bridge) return;
    const tree = (await bridge.invoke("read_dir", { path: FIXTURE })) as DirEntry[];
    const names = tree.map((e) => e.name);
    expect(names).toContain("notes.md");
    expect(names).toContain("guide.adoc");
    expect(names).toContain("partials");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".git");
  });

  it("read_dir with includeHiddenEntries=true reveals .git but never node_modules", async () => {
    if (!bridge) return;
    const tree = (await bridge.invoke("read_dir", {
      path: FIXTURE,
      includeHiddenEntries: true,
    })) as DirEntry[];
    const names = tree.map((e) => e.name);
    expect(names).toContain(".git");
    expect(names).not.toContain("node_modules");
  });

  it("read_file_relative reads a fixture file", async () => {
    if (!bridge) return;
    const content = (await bridge.invoke("read_file_relative", {
      root: FIXTURE,
      relativePath: "notes.md",
    })) as string;
    expect(content).toContain("Sample notes");
    expect(content).toContain("Section A");
  });

  it("read_files_relative returns a map of files, silently skipping missing ones", async () => {
    if (!bridge) return;
    const map = (await bridge.invoke("read_files_relative", {
      root: FIXTURE,
      paths: ["notes.md", "missing.md", "guide.adoc"],
    })) as Record<string, string>;
    expect(Object.keys(map).sort()).toEqual(["guide.adoc", "notes.md"]);
    expect(map["notes.md"]).toContain("Sample notes");
  });

  it("trash_path rejects paths that escape the workspace root", async () => {
    if (!bridge) return;
    await expect(
      bridge.invoke("trash_path", { root: FIXTURE, relative: "../../etc/passwd" }),
    ).rejects.toThrow();
  });
});
