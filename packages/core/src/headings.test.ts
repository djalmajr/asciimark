import { describe, expect, it } from "bun:test";
import {
  extractAsciidocHeadings,
  extractHeadings,
  extractMarkdownHeadings,
} from "./headings.ts";

describe("extractMarkdownHeadings", () => {
  it("extracts ATX headings of every level", () => {
    const md = [
      "# H1",
      "## H2",
      "### H3",
      "#### H4",
      "##### H5",
      "###### H6",
    ].join("\n");
    const out = extractMarkdownHeadings(md);
    expect(out.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.map((h) => h.text)).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
    expect(out.map((h) => h.line)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("ATX requires a space after the `#`s — `#title` is not a heading", () => {
    // Mutation captured: relaxing the regex to allow no-space variants
    // would surface `#tag` (used for inline tagging) as level-1 headings.
    expect(extractMarkdownHeadings("#tag")).toEqual([]);
    expect(extractMarkdownHeadings("# real heading")).toEqual([
      { level: 1, text: "real heading", line: 0 },
    ]);
  });

  it("Setext H1: the title is the line above the `===` underline", () => {
    // Mutation captured: a buggy parser that emits the underline line
    // instead of the title line would have line=1 and text="===".
    const md = ["Title", "====="].join("\n");
    const out = extractMarkdownHeadings(md);
    expect(out).toEqual([{ level: 1, text: "Title", line: 0 }]);
  });

  it("Setext H2: dashes underline yields level 2", () => {
    const md = ["Subtitle", "--------"].join("\n");
    expect(extractMarkdownHeadings(md)).toEqual([
      { level: 2, text: "Subtitle", line: 0 },
    ]);
  });

  it("ignores `#` lines that live inside fenced code blocks", () => {
    // Regression guard: code samples often contain `#` lines for shell
    // prompts or comments. Picking those up would pollute the symbol list.
    const md = [
      "# Real",
      "```",
      "# Not a heading",
      "## Also not",
      "```",
      "## Also Real",
    ].join("\n");
    const out = extractMarkdownHeadings(md);
    expect(out.map((h) => h.text)).toEqual(["Real", "Also Real"]);
  });

  it("strips trailing `#`s from ATX headings (closing sequence is optional)", () => {
    expect(extractMarkdownHeadings("## Title ##")).toEqual([
      { level: 2, text: "Title", line: 0 },
    ]);
  });

  it("returns empty list for source with no headings", () => {
    expect(extractMarkdownHeadings("just paragraph\nwith two lines")).toEqual([]);
  });

  it("preserves heading order even when ATX and Setext are interleaved", () => {
    const md = [
      "# First",
      "",
      "Second",
      "======",
      "",
      "## Third",
    ].join("\n");
    const out = extractMarkdownHeadings(md);
    expect(out.map((h) => h.text)).toEqual(["First", "Second", "Third"]);
    expect(out.map((h) => h.level)).toEqual([1, 1, 2]);
  });
});

describe("extractAsciidocHeadings", () => {
  it("level equals the number of `=` signs", () => {
    // Mutation captured: an off-by-one (`level - 1` or `level + 1`) breaks
    // this exact mapping.
    const adoc = [
      "= Doc Title",
      "== Section",
      "=== Subsection",
      "==== Sub-sub",
    ].join("\n");
    const out = extractAsciidocHeadings(adoc);
    expect(out.map((h) => h.level)).toEqual([1, 2, 3, 4]);
    expect(out.map((h) => h.text)).toEqual(["Doc Title", "Section", "Subsection", "Sub-sub"]);
  });

  it("ignores `=` lines inside listing blocks (---- delimited)", () => {
    const adoc = [
      "= Real",
      "----",
      "== Not a heading",
      "----",
      "== Also Real",
    ].join("\n");
    const out = extractAsciidocHeadings(adoc);
    expect(out.map((h) => h.text)).toEqual(["Real", "Also Real"]);
  });

  it("requires a space between `=` and text", () => {
    expect(extractAsciidocHeadings("==no-space")).toEqual([]);
    expect(extractAsciidocHeadings("== with space")).toEqual([
      { level: 2, text: "with space", line: 0 },
    ]);
  });
});

describe("extractHeadings (dispatch by filename)", () => {
  it("returns markdown headings for .md, .markdown, .mdown files", () => {
    expect(extractHeadings("foo.md", "# Hi").map((h) => h.text)).toEqual(["Hi"]);
    expect(extractHeadings("foo.markdown", "## Bye").map((h) => h.text)).toEqual(["Bye"]);
  });

  it("returns asciidoc headings for .adoc, .asciidoc, .asc files", () => {
    expect(extractHeadings("foo.adoc", "= Hi").map((h) => h.text)).toEqual(["Hi"]);
    expect(extractHeadings("foo.asciidoc", "= Hi").map((h) => h.text)).toEqual(["Hi"]);
  });

  it("returns empty for unknown extensions", () => {
    expect(extractHeadings("foo.txt", "# Hi")).toEqual([]);
    expect(extractHeadings("foo.json", "# Hi")).toEqual([]);
  });
});
