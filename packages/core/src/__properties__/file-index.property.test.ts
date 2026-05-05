import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import type { FSEntry, WorkspaceRoot } from "../types.ts";
import { flattenWorkspace } from "../file-index.ts";

// Recursive arbitrary that mirrors FSEntry: leaves are files, branches are
// directories with N children. Path is computed top-down so each entry's
// `path` is consistent with its position in the tree.
function makeTreeArb(maxDepth: number, maxBranching: number): fc.Arbitrary<FSEntry[]> {
  const baseName = fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/);

  const tree = fc.letrec<{ entry: FSEntry; entries: FSEntry[] }>((rec) => ({
    entry: fc.tuple(baseName, fc.boolean(), fc.nat(maxDepth)).chain(([name, isFile, depthSeed]) => {
      if (isFile || depthSeed === 0) {
        return fc.constant<FSEntry>({ kind: "file", name, path: name });
      }
      return rec("entries").map<FSEntry>((children) => ({
        kind: "directory",
        name,
        path: name,
        children,
      }));
    }),
    entries: fc.array(rec("entry"), { minLength: 0, maxLength: maxBranching }),
  }));

  // After generation the `path` on each node is just the bare name; rewrite
  // them so children carry the parent prefix. This avoids generating
  // collisions in the arbitrary itself.
  return tree.entries.map((entries) => deduplicateAndPrefix(entries, ""));
}

function deduplicateAndPrefix(entries: FSEntry[], prefix: string): FSEntry[] {
  const seen = new Set<string>();
  const out: FSEntry[] = [];
  for (const entry of entries) {
    let candidate = entry.name;
    let suffix = 0;
    while (seen.has(candidate)) {
      suffix += 1;
      candidate = `${entry.name}-${suffix}`;
    }
    seen.add(candidate);
    const path = prefix ? `${prefix}/${candidate}` : candidate;
    if (entry.kind === "file") {
      out.push({ kind: "file", name: candidate, path });
    } else {
      out.push({
        kind: "directory",
        name: candidate,
        path,
        children: entry.children ? deduplicateAndPrefix(entry.children, path) : [],
      });
    }
  }
  return out;
}

function countFiles(entries: FSEntry[]): number {
  let n = 0;
  for (const e of entries) {
    if (e.kind === "file") n += 1;
    else if (e.children) n += countFiles(e.children);
  }
  return n;
}

const treeArb = makeTreeArb(3, 5);

const rootArb: fc.Arbitrary<WorkspaceRoot> = fc.tuple(
  fc.uuid(),
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,15}$/),
  treeArb,
).map(([id, name, entries]) => ({ id, name, entries, collapsed: false }));

describe("file-index invariants (property)", () => {
  it("flatten preserves the count of files in the tree", () => {
    fc.assert(
      fc.property(fc.array(rootArb, { minLength: 0, maxLength: 4 }), (roots) => {
        const expected = roots.reduce((acc, r) => acc + countFiles(r.entries), 0);
        const flat = flattenWorkspace(roots);
        expect(flat.length).toBe(expected);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("(rootId, path) is unique for every IndexedFile within the same flatten call", () => {
    fc.assert(
      fc.property(fc.array(rootArb, { minLength: 0, maxLength: 4 }), (roots) => {
        const flat = flattenWorkspace(roots);
        const keys = new Set(flat.map((f) => `${f.rootId}::${f.path}`));
        expect(keys.size).toBe(flat.length);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("every IndexedFile has kind=file derivation: name = last `/` segment of path", () => {
    fc.assert(
      fc.property(fc.array(rootArb, { minLength: 0, maxLength: 4 }), (roots) => {
        for (const f of flattenWorkspace(roots)) {
          const slash = f.path.lastIndexOf("/");
          const expectedName = slash >= 0 ? f.path.slice(slash + 1) : f.path;
          expect(f.name).toBe(expectedName);
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("parentDir + (`/`?) + name === path for every IndexedFile", () => {
    fc.assert(
      fc.property(fc.array(rootArb, { minLength: 0, maxLength: 4 }), (roots) => {
        for (const f of flattenWorkspace(roots)) {
          const reconstructed = f.parentDir ? `${f.parentDir}/${f.name}` : f.name;
          expect(reconstructed).toBe(f.path);
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });
});
