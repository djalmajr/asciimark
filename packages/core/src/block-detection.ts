// Detect the mermaid diagram block under the cursor (DJA-14). Pure, DOM-free —
// supports Markdown fenced blocks (```mermaid … ```) and AsciiDoc delimited
// blocks ([mermaid] then ---- … ----). Used by the ⌘I handler to switch the
// inline overlay into "diagram" mode and by Insert to replace the block body.

export interface DiagramBlock {
  syntax: "markdown" | "asciidoc";
  /** 0-based line of the opening fence/delimiter. */
  openLine: number;
  /** 0-based line of the closing fence/delimiter, or -1 if unclosed. */
  closeLine: number;
  /** Offset range of the block BODY (between delimiters), for replacement. */
  contentFrom: number;
  contentTo: number;
  /** Current DSL inside the block (trimmed of trailing newline). */
  existingSource: string;
  /** True when the body is empty or whitespace-only. */
  isEmpty: boolean;
}

interface Line {
  text: string;
  start: number;
  end: number;
}

function computeLines(content: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (const text of content.split("\n")) {
    out.push({ text, start, end: start + text.length });
    start += text.length + 1; // + newline
  }
  return out;
}

const MD_OPEN = /^\s*(```+|~~~+)\s*mermaid\s*$/i;
const MD_CLOSE = /^\s*(```+|~~~+)\s*$/;
const ADOC_ATTR = /^\s*\[mermaid(,[^\]]*)?\]\s*$/i;
const ADOC_DELIM = /^----+\s*$/;

function makeBlock(
  syntax: DiagramBlock["syntax"],
  lines: Line[],
  openLine: number,
  closeLine: number,
  content: string,
): DiagramBlock {
  const firstContent = openLine + 1;
  const lastContent = closeLine === -1 ? lines.length - 1 : closeLine - 1;
  let contentFrom: number;
  let contentTo: number;
  if (firstContent > lastContent) {
    // No body lines — collapse to the start of the close line (or EOF).
    contentFrom = contentTo =
      closeLine === -1 ? content.length : lines[closeLine]!.start;
  } else {
    contentFrom = lines[firstContent]!.start;
    contentTo = lines[lastContent]!.end;
  }
  const existingSource = content.slice(contentFrom, contentTo);
  return {
    syntax,
    openLine,
    closeLine,
    contentFrom,
    contentTo,
    existingSource,
    isEmpty: existingSource.trim().length === 0,
  };
}

/** All mermaid blocks in the document, in order. */
export function detectMermaidBlocks(content: string): DiagramBlock[] {
  const lines = computeLines(content);
  const blocks: DiagramBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const text = lines[i]!.text;
    if (MD_OPEN.test(text)) {
      let j = i + 1;
      while (j < lines.length && !MD_CLOSE.test(lines[j]!.text)) j++;
      const closeLine = j < lines.length ? j : -1;
      blocks.push(makeBlock("markdown", lines, i, closeLine, content));
      i = closeLine === -1 ? j : closeLine + 1;
      continue;
    }
    if (ADOC_ATTR.test(text)) {
      const delim = i + 1;
      if (delim < lines.length && ADOC_DELIM.test(lines[delim]!.text)) {
        let j = delim + 1;
        while (j < lines.length && !ADOC_DELIM.test(lines[j]!.text)) j++;
        const closeLine = j < lines.length ? j : -1;
        blocks.push(makeBlock("asciidoc", lines, delim, closeLine, content));
        i = closeLine === -1 ? j : closeLine + 1;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

/** The mermaid block containing `offset`, or null. The cursor on a delimiter
 *  line counts as inside the block. */
export function mermaidBlockAtOffset(
  content: string,
  offset: number,
): DiagramBlock | null {
  const lines = computeLines(content);
  for (const block of detectMermaidBlocks(content)) {
    const openStart = lines[block.openLine]!.start;
    const closeEnd =
      block.closeLine === -1 ? content.length : lines[block.closeLine]!.end;
    if (offset >= openStart && offset <= closeEnd) return block;
  }
  return null;
}

/** The mermaid block containing the 0-based `line`, or null. */
export function mermaidBlockAtLine(
  content: string,
  line: number,
): DiagramBlock | null {
  for (const block of detectMermaidBlocks(content)) {
    const last = block.closeLine === -1 ? Infinity : block.closeLine;
    if (line >= block.openLine && line <= last) return block;
  }
  return null;
}
