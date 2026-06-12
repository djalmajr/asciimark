import { describe, expect, it } from "vitest";
import { asciidoc } from "./adoc-language.ts";

describe("asciidoc stream highlighter", () => {
  it("emits distinct token types for the core constructs", () => {
    const doc = [
      "= Title",
      ":toc:",
      "// a comment",
      "== Section",
      "* item with *bold* and `mono`",
      "----",
      "code body stays unpainted",
      "----",
      "include::other.adoc[]",
      "a link https://example.com here",
    ].join("\n");
    const tree = asciidoc().language.parser.parse(doc);
    const types = new Set<string>();
    tree.iterate({
      enter: (node) => {
        types.add(node.name);
      },
    });
    // Document + at least heading/meta/comment/list/inline/link token types.
    // The exact node names come from the legacy style names; asserting on
    // variety (not naming) keeps this robust to tag-table internals.
    expect(types.size).toBeGreaterThanOrEqual(6);
  });

  it("closes a delimited block only on its matching delimiter", () => {
    const doc = ["----", "= not a heading inside a listing", "----", "= real heading"].join("\n");
    const tree = asciidoc().language.parser.parse(doc);
    const names: string[] = [];
    tree.iterate({
      enter: (node) => {
        if (node.name !== "Document") names.push(node.name);
      },
    });
    // Exactly three painted regions: open delimiter, close delimiter, and the
    // heading AFTER the block — the line inside the listing stays unpainted.
    expect(names).toHaveLength(3);
  });
});
