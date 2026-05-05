import { describe, expect, it } from "bun:test";
import type { FSEntry, WorkspaceRoot } from "./types.ts";
import { flattenWorkspace } from "./file-index.ts";

function file(name: string, path = name): FSEntry {
  return { name, path, kind: "file" };
}

function dir(name: string, children: FSEntry[], path = name): FSEntry {
  return { name, path, kind: "directory", children };
}

function root(id: string, name: string, entries: FSEntry[]): WorkspaceRoot {
  return { id, name, entries, collapsed: false };
}

describe("file-index", () => {
  it("emits one IndexedFile per file entry, skipping directories", () => {
    const flat = flattenWorkspace([
      root("r1", "vault", [
        dir("notes", [file("a.md", "notes/a.md"), file("b.md", "notes/b.md")], "notes"),
        file("README.md"),
      ]),
    ]);

    expect(flat.map((f) => f.path).sort()).toEqual(["README.md", "notes/a.md", "notes/b.md"]);
    expect(flat.every((f) => f.rootId === "r1")).toBe(true);
  });

  it("returns empty list for a workspace of only directories", () => {
    const flat = flattenWorkspace([
      root("r1", "vault", [
        dir("empty-dir", [], "empty-dir"),
        dir("nested-empty", [dir("inner", [], "nested-empty/inner")], "nested-empty"),
      ]),
    ]);

    expect(flat).toEqual([]);
  });

  it("disambiguates same basename across two roots via rootId/rootName", () => {
    const flat = flattenWorkspace([
      root("r1", "alpha", [file("README.md")]),
      root("r2", "beta", [file("README.md")]),
    ]);

    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ rootId: "r1", rootName: "alpha", path: "README.md", name: "README.md" });
    expect(flat[1]).toMatchObject({ rootId: "r2", rootName: "beta", path: "README.md", name: "README.md" });
  });

  it("preserves deep paths with `/` separator and computes parentDir correctly", () => {
    const flat = flattenWorkspace([
      root("r1", "vault", [
        dir("a", [
          dir("b", [
            dir("c", [
              dir("d", [file("deep.md", "a/b/c/d/deep.md")], "a/b/c/d"),
            ], "a/b/c"),
          ], "a/b"),
        ], "a"),
      ]),
    ]);

    expect(flat).toHaveLength(1);
    expect(flat[0]?.path).toBe("a/b/c/d/deep.md");
    expect(flat[0]?.name).toBe("deep.md");
    expect(flat[0]?.parentDir).toBe("a/b/c/d");
  });

  it("computes empty parentDir for files at the root", () => {
    const flat = flattenWorkspace([root("r1", "vault", [file("top.md")])]);
    expect(flat[0]?.parentDir).toBe("");
  });

  it("skips directories that are missing the children array (collapsed/lazy roots)", () => {
    // FSEntry.children is optional — directories not yet expanded omit it.
    // The walker must treat them as if they had zero children.
    const lazyDir: FSEntry = { kind: "directory", name: "lazy", path: "lazy" };
    const flat = flattenWorkspace([root("r1", "vault", [lazyDir, file("seen.md")])]);
    expect(flat.map((f) => f.path)).toEqual(["seen.md"]);
  });
});
