import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import type { IndexedFile } from "../file-index.ts";
import { fuzzyFilter } from "../fuzzy.ts";

const baseName = fc.stringMatching(/^[a-z][a-z0-9_-]{2,12}\.(md|adoc|tsx?|json)$/);
const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,8}$/);

const fileArb: fc.Arbitrary<IndexedFile> = fc.tuple(
  fc.uuid(),
  fc.array(segment, { minLength: 0, maxLength: 4 }),
  baseName,
).map(([rootId, dirs, name]) => {
  const parentDir = dirs.join("/");
  const path = parentDir ? `${parentDir}/${name}` : name;
  return { rootId, rootName: "root", path, name, parentDir };
});

// Generate a list with unique (rootId, path) keys — the dedup invariant of
// `flattenWorkspace` would otherwise be a precondition we'd have to model.
const fileListArb = fc.uniqueArray(fileArb, {
  selector: (f) => `${f.rootId}::${f.path}`,
  minLength: 1,
  maxLength: 30,
});

describe("fuzzy invariants (property)", () => {
  it("typing the exact basename surfaces that file in the top-3 results", () => {
    fc.assert(
      fc.property(fileListArb, fc.nat(), (files, idxSeed) => {
        const target = files[idxSeed % files.length]!;
        const results = fuzzyFilter(target.name, files);
        // Must appear at all
        const hit = results.findIndex((r) => r.file.path === target.path && r.file.rootId === target.rootId);
        expect(hit).toBeGreaterThanOrEqual(0);
        // And in the top 3 — fzf's exact basename match scores highest
        // among any peers whose names only partially overlap.
        expect(hit).toBeLessThan(3);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("empty query returns every input file when below the limit", () => {
    fc.assert(
      fc.property(fileListArb, (files) => {
        const results = fuzzyFilter("", files, { limit: 100 });
        expect(results).toHaveLength(files.length);
        const inputKeys = new Set(files.map((f) => `${f.rootId}::${f.path}`));
        const outputKeys = new Set(results.map((r) => `${r.file.rootId}::${r.file.path}`));
        expect(outputKeys).toEqual(inputKeys);
        return true;
      }),
      { numRuns: 30 },
    );
  });

  it("empty query with recents groups every recent before every non-recent", () => {
    fc.assert(
      fc.property(fileListArb, fc.nat(), (files, recentSeed) => {
        const recentCount = (recentSeed % files.length);
        const recentSet = new Set(
          files.slice(0, recentCount).map((f) => `${f.rootId}::${f.path}`),
        );
        const results = fuzzyFilter("", files, { recents: recentSet, limit: 100 });

        // Find the boundary index where the first non-recent appears; every
        // result before that boundary must be a recent, every result after
        // it must be non-recent.
        let firstNonRecent = -1;
        for (let i = 0; i < results.length; i += 1) {
          const key = `${results[i]!.file.rootId}::${results[i]!.file.path}`;
          if (!recentSet.has(key)) {
            firstNonRecent = i;
            break;
          }
        }
        if (firstNonRecent === -1) return true; // entire list is recent

        for (let i = firstNonRecent; i < results.length; i += 1) {
          const key = `${results[i]!.file.rootId}::${results[i]!.file.path}`;
          expect(recentSet.has(key)).toBe(false);
        }
        return true;
      }),
      { numRuns: 30 },
    );
  });

  it("results are always score-monotonically non-increasing", () => {
    fc.assert(
      fc.property(fileListArb, fc.string({ minLength: 1, maxLength: 6 }), (files, query) => {
        const results = fuzzyFilter(query, files);
        for (let i = 1; i < results.length; i += 1) {
          expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("never returns more entries than the limit, regardless of input", () => {
    fc.assert(
      fc.property(fileListArb, fc.string({ maxLength: 6 }), fc.integer({ min: 1, max: 50 }), (files, query, limit) => {
        const results = fuzzyFilter(query, files, { limit });
        expect(results.length).toBeLessThanOrEqual(limit);
        return true;
      }),
      { numRuns: 50 },
    );
  });
});
