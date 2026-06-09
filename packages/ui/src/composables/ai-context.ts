// Explicit AI context items (Cursor-style "@mentions"/attachments) shown as
// removable chips in the chat composer. Hybrid model: the ACTIVE document is
// surfaced as a chip but read by the existing `getActiveDoc` app tool (no
// double tokens); items the user adds explicitly (file-tree "Add to chat",
// drag-and-drop, a selection, an @mention) carry their resolved content here
// and get injected into the next message sent to the model.

export interface AiContextItem {
  /** Stable id (e.g. `file:rootId:path` or `selection:...`) for dedupe/removal. */
  id: string;
  kind: "file" | "selection";
  /** Chip label — a file name, or "file.md:12-20" for a selection. */
  label: string;
  path?: string;
  rootId?: string;
  /** The resolved text injected into the prompt. */
  content: string;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

/**
 * Build the context preamble injected into the user's message (the displayed
 * turn stays clean — only what's sent to the model carries this). Returns
 * `undefined` when there is no explicit context so the message is unchanged.
 */
export function buildContextPreamble(items: AiContextItem[]): string | undefined {
  if (items.length === 0) return undefined;
  const blocks = items.map(
    (item) => `<context kind="${item.kind}" source="${escapeAttr(item.label)}">\n${item.content}\n</context>`,
  );
  return `The user attached the following context — use it when relevant:\n\n${blocks.join("\n\n")}`;
}

/** Minimal shape of an Excalidraw scene (from the guest's `getScene` RPC). */
export interface ExcalidrawScene {
  appState?: { selectedElementIds?: Record<string, boolean> };
  elements?: ExcalidrawElement[];
}
interface ExcalidrawElement {
  id: string;
  type: string;
  text?: string;
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
  boundElements?: Array<{ id: string; type: string }> | null;
  isDeleted?: boolean;
}

/**
 * Turn an Excalidraw selection into an AI context item — a compact, readable
 * text outline (shapes + their text + arrow connections), NOT raw element JSON
 * (verbose + the model reads structure poorly). Returns null when nothing is
 * selected, so ⌘I stays a no-op on an empty canvas (mirrors the editor path).
 */
export function excalidrawSelectionToContext(
  scene: ExcalidrawScene | null | undefined,
  file: { name: string; path: string },
): AiContextItem | null {
  const elements = (scene?.elements ?? []).filter((e) => !e.isDeleted);
  const selectedIds = scene?.appState?.selectedElementIds ?? {};
  const selected = elements.filter((e) => selectedIds[e.id]);
  if (selected.length === 0) return null;

  const byId = new Map(elements.map((e) => [e.id, e]));
  const textOf = (el: ExcalidrawElement): string | undefined => {
    if (el.type === "text") return el.text?.trim() || undefined;
    const bound = (el.boundElements ?? []).find((b) => b.type === "text");
    const inner = bound ? byId.get(bound.id)?.text?.trim() : undefined;
    return inner || undefined;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const describe = (el: ExcalidrawElement): string => {
    if (el.type === "arrow" || el.type === "line") {
      const from = el.startBinding?.elementId ? byId.get(el.startBinding.elementId) : undefined;
      const to = el.endBinding?.elementId ? byId.get(el.endBinding.elementId) : undefined;
      const label = textOf(el);
      if (from || to) {
        const a = from ? (textOf(from) ?? from.type) : "?";
        const b = to ? (textOf(to) ?? to.type) : "?";
        return `Arrow: "${a}" → "${b}"${label ? ` (label: "${label}")` : ""}`;
      }
      return label ? `Arrow "${label}"` : "Arrow";
    }
    const t = textOf(el);
    return t ? `${cap(el.type)} "${t}"` : cap(el.type);
  };

  const lines = selected.map((e) => `- ${describe(e)}`);
  const content = `Excalidraw selection — ${selected.length} element${selected.length === 1 ? "" : "s"} from ${file.name}:\n${lines.join("\n")}`;
  return {
    id: `excalidraw-selection:${file.path}:${selected.map((e) => e.id).sort().join(",")}`,
    kind: "selection",
    label: `${file.name} · ${selected.length} el`,
    path: file.path,
    content,
  };
}
