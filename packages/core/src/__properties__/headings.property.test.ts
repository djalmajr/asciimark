import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { extractAsciidocHeadings, extractMarkdownHeadings } from "../headings.ts";

// Disallow leading or trailing whitespace — the extractor trims, and the
// property should be about the *content*, not whitespace-handling.
const titleArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,29}[A-Za-z0-9_-]$/);
const levelArb = fc.integer({ min: 1, max: 6 });

describe("headings invariants (property)", () => {
  it("ATX: a heading line of level N produces exactly one Heading with that level", () => {
    fc.assert(
      fc.property(levelArb, titleArb, (level, title) => {
        const md = `${"#".repeat(level)} ${title}`;
        const out = extractMarkdownHeadings(md);
        expect(out).toHaveLength(1);
        expect(out[0]!.level).toBe(level);
        expect(out[0]!.text).toBe(title);
        expect(out[0]!.line).toBe(0);
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("Asciidoc: a heading line of level N produces exactly one Heading with that level", () => {
    fc.assert(
      fc.property(levelArb, titleArb, (level, title) => {
        const adoc = `${"=".repeat(level)} ${title}`;
        const out = extractAsciidocHeadings(adoc);
        expect(out).toHaveLength(1);
        expect(out[0]!.level).toBe(level);
        expect(out[0]!.text).toBe(title);
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("ATX heading line indices are strictly increasing in the output", () => {
    // For any randomly-shuffled list of headings interleaved with paragraph
    // lines, the extracted line numbers must be monotonically increasing
    // (we never reorder).
    const lineArb = fc.oneof(
      fc.tuple(levelArb, titleArb).map(([l, t]) => `${"#".repeat(l)} ${t}`),
      titleArb.map((t) => `${t}.`),
    );
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 0, maxLength: 30 }), (lines) => {
        const out = extractMarkdownHeadings(lines.join("\n"));
        for (let i = 1; i < out.length; i += 1) {
          expect(out[i]!.line).toBeGreaterThan(out[i - 1]!.line);
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("text inside a fenced block is never extracted as a heading (markdown)", () => {
    fc.assert(
      fc.property(levelArb, titleArb, levelArb, titleArb, (l1, t1, l2, t2) => {
        const md = [
          `${"#".repeat(l1)} ${t1}`, // real heading before the fence
          "```",
          `${"#".repeat(l2)} ${t2}`, // fenced "heading" — must be ignored
          "```",
        ].join("\n");
        const out = extractMarkdownHeadings(md);
        expect(out.map((h) => h.text)).toEqual([t1]);
        return true;
      }),
      { numRuns: 50 },
    );
  });
});
