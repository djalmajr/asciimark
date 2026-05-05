import { describe, expect, it } from "bun:test";
import type { IndexedFile } from "./file-index.ts";
import { fuzzyFilter } from "./fuzzy.ts";

function f(rootId: string, path: string): IndexedFile {
  const slash = path.lastIndexOf("/");
  return {
    rootId,
    rootName: rootId,
    path,
    name: slash >= 0 ? path.slice(slash + 1) : path,
    parentDir: slash >= 0 ? path.slice(0, slash) : "",
  };
}

describe("fuzzy", () => {
  // Each `it` documents the mutation it locks in. Keep the comments — they
  // are the only thing standing between this test file and a future commit
  // that "simplifies" the ranking logic into a no-op.

  it("basename match scores at least NAME_BONUS higher than a path-only match — guards the bonus", () => {
    // Mutation captured: setting NAME_BONUS to 0 collapses the score delta
    // below 100 (fzf raw scores for these two queries are equal at ~80),
    // which fails the `> 50` lower bound. A pure ordering assertion would
    // not detect the mutation because Array.sort is stable and our name
    // pass pushes results before the path pass.
    const fooMd = f("r1", "deeply/nested/foo.md");
    const xMd = f("r1", "foo/x.md");
    const results = fuzzyFilter("foo", [fooMd, xMd]);

    expect(results[0]?.file.path).toBe("deeply/nested/foo.md");
    expect(results[1]?.file.path).toBe("foo/x.md");
    expect(results[0]!.score - results[1]!.score).toBeGreaterThan(50);
    expect(results[0]?.namePositions.length).toBeGreaterThan(0);
    expect(results[1]?.pathPositions.length).toBeGreaterThan(0);
  });

  it("recent file scores at least RECENT_BONUS higher than a non-recent peer — guards the boost", () => {
    // Mutation captured: zeroing RECENT_BONUS makes the two files tie on
    // raw + name bonus, and the score delta below collapses to 0. A pure
    // ordering assertion would mask the mutation because Array.sort is
    // stable: the recent file (pushed second after the non-recent in name
    // match output ordering) would actually move to second.
    const aReadme = f("r1", "a/README.md");
    const bReadme = f("r2", "b/README.md");
    const results = fuzzyFilter("readme", [aReadme, bReadme], {
      recents: new Set(["r2::b/README.md"]),
    });

    expect(results[0]?.file.rootId).toBe("r2");
    expect(results[0]!.score - results[1]!.score).toBeGreaterThan(50);
  });

  it("empty query with no recents preserves input order and respects the limit", () => {
    // Mutation captured: collapsing the empty-query branch into a generic
    // fzf.find("") would surface fzf's internal tie-break ordering (file
    // insertion order is no longer an output guarantee).
    const files = [
      f("r1", "a.md"),
      f("r1", "b.md"),
      f("r1", "c.md"),
      f("r1", "d.md"),
    ];
    const results = fuzzyFilter("", files, { limit: 3 });

    expect(results.map((r) => r.file.path)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("empty query with recents puts every recent before every non-recent", () => {
    // Mutation captured: deleting the `recent.push` branch (or letting
    // recents fall through) puts the input in raw insertion order.
    const files = [
      f("r1", "old/a.md"),
      f("r1", "old/b.md"),
      f("r1", "fresh/x.md"),
      f("r1", "fresh/y.md"),
    ];
    const results = fuzzyFilter("", files, {
      recents: new Set(["r1::fresh/x.md", "r1::fresh/y.md"]),
    });

    expect(results.slice(0, 2).map((r) => r.file.path).sort()).toEqual(["fresh/x.md", "fresh/y.md"]);
    expect(results.slice(2).map((r) => r.file.path).sort()).toEqual(["old/a.md", "old/b.md"]);
  });

  it("smart-case: a lowercase query matches a mixed-case basename", () => {
    // Regression / behavior contract: VS Code-style Quick Open is
    // case-insensitive when the query has no uppercase letters.
    const readme = f("r1", "README.md");
    const results = fuzzyFilter("readme", [readme]);
    expect(results).toHaveLength(1);
  });

  it("returns an empty list when nothing matches a non-empty query", () => {
    const results = fuzzyFilter("zzzzz", [f("r1", "alpha.md"), f("r1", "beta.md")]);
    expect(results).toEqual([]);
  });

  it("never returns the same file twice, even when both name and path would match", () => {
    // The path-match pass filters out files already returned by the name
    // pass via the `seen` set — without that filter, a file like
    // "foo/foo.md" would match "foo" once on the basename and once on
    // the path. Mutation captured: removing the `seen` filter.
    const result = fuzzyFilter("foo", [f("r1", "foo/foo.md")]);
    expect(result).toHaveLength(1);
  });

  it("highlight positions are sorted ascending", () => {
    // Downstream renderer assumes sorted positions to splice the basename
    // into <mark> chunks. fzf returns a Set, so explicit sort is required.
    const results = fuzzyFilter("rdm", [f("r1", "README.md")]);
    const positions = results[0]?.namePositions ?? [];
    expect(positions.length).toBeGreaterThan(1);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    }
  });
});
