// Inline action prompts (DJA-13). Pure data + prompt builders — no IO, no i18n,
// runtime-agnostic — so they're shared by the inline overlay and the sidebar
// and unit-tested in isolation. Each action transforms the editor selection.

export type InlineActionId = "rewrite" | "fixGrammar" | "translate" | "summarize";

export interface InlineAction {
  id: InlineActionId;
  /** i18n message key resolved by the UI. */
  labelKey: string;
  /** `replace` swaps the selection with the result (rewrite/fix/translate);
   *  `insert` offers the result as an addition (summarize). */
  replaceMode: "replace" | "insert";
  /** Whether the action needs a target language (translate). */
  needsTargetLang?: boolean;
}

export const INLINE_ACTIONS: readonly InlineAction[] = [
  { id: "rewrite", labelKey: "ai_action_rewrite", replaceMode: "replace" },
  { id: "fixGrammar", labelKey: "ai_action_fix_grammar", replaceMode: "replace" },
  {
    id: "translate",
    labelKey: "ai_action_translate",
    replaceMode: "replace",
    needsTargetLang: true,
  },
  { id: "summarize", labelKey: "ai_action_summarize", replaceMode: "insert" },
];

export function getInlineAction(id: InlineActionId): InlineAction | undefined {
  return INLINE_ACTIONS.find((a) => a.id === id);
}

export interface InlineActionInput {
  text: string;
  /** Target language for `translate` (e.g. "pt-BR", "English"). */
  targetLang?: string;
  /** Optional document title for light context. */
  docTitle?: string;
}

const BASE_SYSTEM =
  "You are a precise technical-writing assistant embedded in a Markdown/AsciiDoc editor. " +
  "Return ONLY the transformed text — no preamble, no explanation, no surrounding code fences. " +
  "Preserve the original markup, code, and formatting.";

/** Build the {system, user} prompt pair for an inline action over `input.text`. */
export function buildInlineActionPrompt(
  id: InlineActionId,
  input: InlineActionInput,
): { system: string; user: string } {
  switch (id) {
    case "rewrite":
      return {
        system: `${BASE_SYSTEM} Rewrite the text to be clearer and better-flowing while preserving its meaning and tone.`,
        user: input.text,
      };
    case "fixGrammar":
      return {
        system: `${BASE_SYSTEM} Fix spelling, grammar, and punctuation only — make no stylistic changes beyond correctness.`,
        user: input.text,
      };
    case "translate":
      return {
        system: `${BASE_SYSTEM} Translate the text to ${input.targetLang ?? "English"}.`,
        user: input.text,
      };
    case "summarize":
      return {
        system: `${BASE_SYSTEM} Summarize the text concisely in the same language as the input.`,
        user: input.text,
      };
  }
}
