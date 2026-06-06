import { describe, expect, it } from "bun:test";
import {
  detectMermaidBlocks,
  mermaidBlockAtLine,
  mermaidBlockAtOffset,
} from "./block-detection.ts";

const MD = "# Title\n\n```mermaid\ngraph LR\nA --> B\n```\n\nafter\n";
const ADOC = "= Title\n\n[mermaid]\n----\ngraph TD\nX --> Y\n----\n\nafter\n";
const EMPTY_MD = "intro\n\n```mermaid\n```\n\nend\n";

describe("detectMermaidBlocks", () => {
  it("detects a Markdown fenced mermaid block with its body", () => {
    const [b] = detectMermaidBlocks(MD);
    expect(b!.syntax).toBe("markdown");
    expect(b!.existingSource).toBe("graph LR\nA --> B");
    expect(b!.isEmpty).toBe(false);
    expect(MD.slice(b!.contentFrom, b!.contentTo)).toBe("graph LR\nA --> B");
  });

  it("detects an AsciiDoc delimited mermaid block", () => {
    const [b] = detectMermaidBlocks(ADOC);
    expect(b!.syntax).toBe("asciidoc");
    expect(b!.existingSource).toBe("graph TD\nX --> Y");
  });

  it("flags an empty block as isEmpty with a zero-width content range", () => {
    const [b] = detectMermaidBlocks(EMPTY_MD);
    expect(b!.isEmpty).toBe(true);
    expect(b!.existingSource).toBe("");
    expect(b!.contentFrom).toBe(b!.contentTo);
  });

  it("ignores non-mermaid fenced blocks", () => {
    expect(detectMermaidBlocks("```ts\nconst x = 1;\n```\n")).toHaveLength(0);
  });

  it("marks an unclosed block with closeLine -1", () => {
    const blocks = detectMermaidBlocks("```mermaid\ngraph LR\nA --> B\n");
    expect(blocks[0]!.closeLine).toBe(-1);
  });
});

describe("mermaidBlockAtOffset / mermaidBlockAtLine", () => {
  it("returns the block when the cursor is inside the body", () => {
    const idx = MD.indexOf("A --> B") + 2;
    expect(mermaidBlockAtOffset(MD, idx)?.syntax).toBe("markdown");
  });

  it("counts the cursor on the opening fence as inside", () => {
    const idx = MD.indexOf("```mermaid") + 2;
    expect(mermaidBlockAtOffset(MD, idx)).not.toBeNull();
  });

  it("returns null when the cursor is outside any block", () => {
    expect(mermaidBlockAtOffset(MD, MD.indexOf("after"))).toBeNull();
  });

  it("resolves a block by line number", () => {
    // 0-based: line 3 is "graph LR" in MD
    expect(mermaidBlockAtLine(MD, 3)?.existingSource).toContain("graph LR");
    expect(mermaidBlockAtLine(MD, 0)).toBeNull();
  });
});
