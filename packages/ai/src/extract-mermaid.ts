// Post-process an LLM response into clean Mermaid DSL (DJA-14). Models often
// wrap output in ```mermaid fences or add a sentence of prose before the
// diagram; this strips both. Pure.

const DIAGRAM_TOKENS =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|xychart-beta|block-beta|sankey-beta)\b/i;

/** Strip code fences + leading prose, returning the Mermaid DSL. Returns "" when
 *  no recognizable diagram keyword is present (caller treats as invalid). */
export function extractMermaid(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  if (fence) text = fence[1]!.trim();
  const lines = text.split("\n");
  const start = lines.findIndex((l) => DIAGRAM_TOKENS.test(l.trim()));
  if (start === -1) return "";
  return lines.slice(start).join("\n").trim();
}
