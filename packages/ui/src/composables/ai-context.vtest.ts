import { describe, expect, it } from "vitest";
import {
  buildContextPreamble,
  excalidrawSelectionToContext,
  type AiContextItem,
} from "./ai-context.ts";

const FILE = { name: "diagram.excalidraw", path: "/d/diagram.excalidraw" };
const selected = (...ids: string[]): Record<string, boolean> =>
  Object.fromEntries(ids.map((id) => [id, true]));

describe("buildContextPreamble", () => {
  it("returns undefined when there are no items (message unchanged)", () => {
    expect(buildContextPreamble([])).toBeUndefined();
  });

  it("wraps each item in a labelled context block", () => {
    const items: AiContextItem[] = [
      { id: "f1", kind: "file", label: "a.md", content: "hello" },
      { id: "s1", kind: "selection", label: "b.md:1-2", content: "world" },
    ];
    const out = buildContextPreamble(items)!;
    expect(out).toContain('<context kind="file" source="a.md">');
    expect(out).toContain("hello");
    expect(out).toContain('<context kind="selection" source="b.md:1-2">');
    expect(out).toContain("world");
  });

  it("escapes quotes in the source label", () => {
    const out = buildContextPreamble([{ id: "x", kind: "file", label: 'a"b.md', content: "c" }])!;
    expect(out).toContain("a&quot;b.md");
  });
});

describe("excalidrawSelectionToContext", () => {
  it("returns null when nothing is selected (⌘I stays a no-op)", () => {
    const scene = { appState: { selectedElementIds: {} }, elements: [{ id: "a", type: "rectangle", text: "X" }] };
    expect(excalidrawSelectionToContext(scene, FILE)).toBeNull();
    expect(excalidrawSelectionToContext(null, FILE)).toBeNull();
  });

  it("outlines selected shapes by type + text", () => {
    const scene = {
      appState: { selectedElementIds: selected("r1", "t1") },
      elements: [
        { id: "r1", type: "rectangle", text: undefined },
        { id: "t1", type: "text", text: "Hello" },
      ],
    };
    const item = excalidrawSelectionToContext(scene, FILE)!;
    expect(item.kind).toBe("selection");
    expect(item.content).toContain("Rectangle");
    expect(item.content).toContain('Text "Hello"');
    expect(item.content).toContain("2 elements");
  });

  it("describes arrows by the elements they connect (via bindings)", () => {
    const scene = {
      appState: { selectedElementIds: selected("a1") },
      elements: [
        { id: "b1", type: "rectangle", boundElements: [{ id: "lb1", type: "text" }] },
        { id: "lb1", type: "text", text: "Frontend" },
        { id: "b2", type: "rectangle", boundElements: [{ id: "lb2", type: "text" }] },
        { id: "lb2", type: "text", text: "API" },
        { id: "a1", type: "arrow", startBinding: { elementId: "b1" }, endBinding: { elementId: "b2" } },
      ],
    };
    // Mutation: ignoring bindings would lose the diagram's meaning (which box
    // connects to which) — the whole point of attaching a diagram selection.
    const item = excalidrawSelectionToContext(scene, FILE)!;
    expect(item.content).toContain('Arrow: "Frontend" → "API"');
  });

  it("skips deleted elements and uses a stable id", () => {
    const scene = {
      appState: { selectedElementIds: selected("r1", "gone") },
      elements: [
        { id: "r1", type: "rectangle", text: "Keep" },
        { id: "gone", type: "rectangle", text: "Dead", isDeleted: true },
      ],
    };
    const item = excalidrawSelectionToContext(scene, FILE)!;
    expect(item.content).toContain("1 element");
    expect(item.content).not.toContain("Dead");
    expect(item.id).toBe("excalidraw-selection:/d/diagram.excalidraw:r1");
  });
});
