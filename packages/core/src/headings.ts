/**
 * Heading extraction for the Go-to-Symbol palette. Pure parsing, no DOM.
 *
 * Markdown: ATX (`# Title`) and Setext (`Title\n===`) — the two CommonMark
 * heading shapes our renderer already supports. We do NOT use markdown-it
 * tokens here because Symbol jumps need to work without paying a full
 * render — the palette opens fast and we extract straight from the source.
 *
 * AsciiDoc: `= Title`, `== Subsection`, `=== …` — the level is the count
 * of `=` signs. The block title attribute (`.Title` on a non-section
 * block) is intentionally NOT extracted — it's not navigable.
 */

import { isAdocFile, isMdFile } from "./utils.ts";

export interface Heading {
  /** 1 (top) through 6. AsciiDoc supports 1-5 in practice; we cap at 6. */
  level: number;
  /** Heading text, with surrounding whitespace and leading anchor markers
   *  trimmed. NOT slugified. */
  text: string;
  /** 0-indexed line number in the source content. The CodeMirror jump
   *  uses this directly as the line index. */
  line: number;
}

/**
 * Lines starting with up to three spaces of indent count as ATX headings
 * — CommonMark §4.2. Four+ spaces would be code blocks. The trailing
 * `#`s are optional and stripped.
 */
const ATX_HEADING = /^ {0,3}(#{1,6})\s+(.+?)(\s+#+\s*)?$/;

/** Asciidoc section title: `=` to `=====`, then a space, then text. */
const ADOC_HEADING = /^(={1,6})\s+(.+?)\s*$/;

/** Setext H1 (`=== under it`) requires the *next* line to be all `=`. H2 uses `-`. */
const SETEXT_UNDERLINE_H1 = /^=+\s*$/;
const SETEXT_UNDERLINE_H2 = /^-+\s*$/;

/**
 * Extracts headings from the given source. Returns them in the order they
 * appear in the document. Caller is responsible for picking the parser
 * by filename — `extractHeadings` dispatches to the right one.
 *
 * Mutation-survival contracts (locked in by `headings.test.ts`):
 *   - Inverting Setext detection (treating `===` as the heading itself)
 *     fails the "setext H1 line is the title line, not the underline".
 *   - Treating ATX without space (`#title`) as a heading fails the
 *     "ATX requires a space" guard.
 *   - Counting `==` in Asciidoc as level 1 (off-by-one) fails the
 *     "asciidoc heading level equals number of equals signs".
 */
export function extractHeadings(filename: string, content: string): Heading[] {
  if (isAdocFile(filename)) return extractAsciidocHeadings(content);
  if (isMdFile(filename)) return extractMarkdownHeadings(content);
  return [];
}

export function extractMarkdownHeadings(content: string): Heading[] {
  const lines = content.split("\n");
  const out: Heading[] = [];
  let inFence = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trimStart();

    // Track ``` / ~~~ fenced code blocks so we don't pick `#` lines from inside them.
    if (!inFence) {
      const fenceMatch = trimmed.match(/^(```+|~~~+)/);
      if (fenceMatch && line.match(/^ {0,3}/)?.[0]?.length !== undefined) {
        inFence = true;
        fenceMarker = fenceMatch[1]!;
        continue;
      }
    } else {
      if (trimmed.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }

    const atx = line.match(ATX_HEADING);
    if (atx) {
      out.push({ level: atx[1]!.length, text: atx[2]!.trim(), line: i });
      continue;
    }

    // Setext: the CURRENT non-empty line is the title; the NEXT line is
    // the underline. Skip if the title is empty or starts with `>`/list
    // marker (those preempt setext per CommonMark).
    const next = lines[i + 1] ?? "";
    if (line.trim().length > 0 && !line.match(/^ {0,3}[>*+\-]/) && next.length > 0) {
      if (next.match(SETEXT_UNDERLINE_H1)) {
        out.push({ level: 1, text: line.trim(), line: i });
      } else if (next.match(SETEXT_UNDERLINE_H2)) {
        out.push({ level: 2, text: line.trim(), line: i });
      }
    }
  }

  return out;
}

export function extractAsciidocHeadings(content: string): Heading[] {
  const lines = content.split("\n");
  const out: Heading[] = [];
  let inListing = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";

    // ----, ====, **** are listing/example/sidebar block delimiters in
    // Asciidoc. Inside them we skip all parsing to avoid eating literal
    // content as section titles.
    if (line.match(/^----+\s*$/) || line.match(/^\*{4,}\s*$/)) {
      inListing = !inListing;
      continue;
    }
    if (inListing) continue;

    const match = line.match(ADOC_HEADING);
    if (match) {
      const level = match[1]!.length;
      out.push({ level, text: match[2]!.trim(), line: i });
    }
  }

  return out;
}
