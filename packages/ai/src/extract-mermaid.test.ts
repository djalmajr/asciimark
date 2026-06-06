import { describe, expect, it } from "bun:test";
import { extractMermaid } from "./extract-mermaid.ts";

describe("extractMermaid", () => {
  it("strips a ```mermaid code fence", () => {
    expect(extractMermaid("```mermaid\ngraph LR\nA --> B\n```")).toBe("graph LR\nA --> B");
  });

  it("strips a plain ``` fence", () => {
    expect(extractMermaid("```\nflowchart TD\nX --> Y\n```")).toBe("flowchart TD\nX --> Y");
  });

  it("drops leading prose before the first diagram keyword", () => {
    const raw = "Here's a diagram of the flow:\ngraph LR\nA --> B";
    expect(extractMermaid(raw)).toBe("graph LR\nA --> B");
  });

  it("preserves already-clean DSL", () => {
    expect(extractMermaid("sequenceDiagram\nA->>B: hi")).toBe("sequenceDiagram\nA->>B: hi");
  });

  it("returns empty when there is no recognizable diagram keyword", () => {
    expect(extractMermaid("I cannot create that diagram.")).toBe("");
  });
});
