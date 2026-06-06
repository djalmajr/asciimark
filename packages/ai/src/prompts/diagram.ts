// System prompt for diagram-from-text (DJA-14). Forces Mermaid-only output so
// extract-mermaid has clean input. Pure.

export function diagramSystemPrompt(existingSource?: string): string {
  const base =
    "You generate Mermaid diagram code from the user's description for a technical-writing app. " +
    "Output ONLY valid Mermaid DSL — no prose, no explanation, no surrounding code fences. " +
    "Pick the most fitting diagram type (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, etc.).";
  if (existingSource && existingSource.trim().length > 0) {
    return `${base}\n\nThe block currently contains this diagram — refine or replace it per the request:\n${existingSource}`;
  }
  return base;
}
