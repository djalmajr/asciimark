import { describe, expect, it } from "bun:test";
import { joinRelative, withDefaultExtension } from "./fs-paths.ts";

describe("withDefaultExtension", () => {
  // Mutation: dropping the `.md` default leaves bare names extension-less.
  it("appends .md when the basename has no extension", () => {
    expect(withDefaultExtension("notas")).toBe("notas.md");
    expect(withDefaultExtension("sub/dir/guia")).toBe("sub/dir/guia.md");
  });

  // Mutation: always-appending .md would corrupt names that already carry one.
  it("keeps an existing extension (including in subdirs)", () => {
    expect(withDefaultExtension("a.txt")).toBe("a.txt");
    expect(withDefaultExtension("sub/data.json")).toBe("sub/data.json");
    expect(withDefaultExtension("diagram.excalidraw")).toBe("diagram.excalidraw");
  });
});

describe("joinRelative", () => {
  // Mutation: a leading or doubled slash breaks the workspace-relative path.
  it("joins parent and child, collapsing a trailing slash", () => {
    expect(joinRelative("docs", "x.md")).toBe("docs/x.md");
    expect(joinRelative("docs/", "x.md")).toBe("docs/x.md");
    expect(joinRelative("a/b", "c.md")).toBe("a/b/c.md");
  });

  // Mutation: prefixing a slash at the root would escape to an absolute path.
  it("returns the bare name at the workspace root (empty parent)", () => {
    expect(joinRelative("", "x.md")).toBe("x.md");
  });
});
