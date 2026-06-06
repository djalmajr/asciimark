import { describe, expect, it } from "bun:test";
import {
  INLINE_ACTIONS,
  buildInlineActionPrompt,
  getInlineAction,
  type InlineActionId,
} from "./actions.ts";

describe("INLINE_ACTIONS", () => {
  it("ships the four M1 actions with unique ids", () => {
    const ids = INLINE_ACTIONS.map((a) => a.id);
    expect(ids).toEqual(["rewrite", "fixGrammar", "translate", "summarize"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks translate as needing a target language and summarize as insert", () => {
    expect(getInlineAction("translate")?.needsTargetLang).toBe(true);
    expect(getInlineAction("summarize")?.replaceMode).toBe("insert");
    expect(getInlineAction("rewrite")?.replaceMode).toBe("replace");
  });
});

describe("buildInlineActionPrompt", () => {
  const cases: InlineActionId[] = ["rewrite", "fixGrammar", "translate", "summarize"];

  it("builds a system+user pair for every action and passes the text through", () => {
    for (const id of cases) {
      const p = buildInlineActionPrompt(id, { text: "Hello world" });
      expect(p.user).toBe("Hello world");
      expect(p.system.length).toBeGreaterThan(0);
      // Mutation guard: the "return only" instruction keeps the model from
      // wrapping the result in prose/fences.
      expect(p.system.toLowerCase()).toContain("return only");
    }
  });

  it("injects the target language into the translate system prompt", () => {
    const p = buildInlineActionPrompt("translate", { text: "Olá", targetLang: "English" });
    expect(p.system).toContain("English");
  });

  it("defaults translate to English when no target language is given", () => {
    const p = buildInlineActionPrompt("translate", { text: "Olá" });
    expect(p.system).toContain("English");
  });
});
