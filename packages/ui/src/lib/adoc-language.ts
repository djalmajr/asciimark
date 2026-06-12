// Lightweight AsciiDoc syntax highlighting for the CodeMirror editor.
// No Lezer grammar exists for AsciiDoc (and the community language-data
// registry has no entry), so this is a hand-rolled StreamLanguage covering
// the constructs that carry real signal in a document: section titles,
// comments, document attributes, block delimiters/attribute lines, list
// markers, macros and the common inline marks. Legacy CM5 style names map
// onto the default highlight tags ("header" → heading, "em" → emphasis, …).

import { LanguageSupport, StreamLanguage, type StringStream } from "@codemirror/language";

interface AdocStreamState {
  /** Open delimited block ("----", "....", "////", …) awaiting its close. */
  fence: string | null;
  /** The open block is a comment block (////) — paint its body too. */
  fenceIsComment: boolean;
}

const BLOCK_DELIMITER = /^(-{4,}|\.{4,}|={4,}|\*{4,}|_{4,}|\+{4,}|\/{4,})\s*$/;
const MACRO_LINE = /^(include|image|video|audio|toc)::[^[\]\n]*\[[^\]\n]*\]\s*$/;

function tokenAtLineStart(stream: StringStream, state: AdocStreamState): string | null {
  // Section title: "= Title" … "====== Title".
  if (stream.match(/^={1,6}\s.*$/)) return "header";
  // Line comment (block comments are fences, handled below).
  if (stream.match(/^\/\/.*$/)) return "comment";
  // Document attribute: ":toc:", ":icons: font", ":sectnums!:".
  if (stream.match(/^:[\w][\w-]*!?:.*$/)) return "meta";
  // Block attribute / anchor / title line: "[source,js]", "[[id]]", ".Title".
  if (stream.match(/^\[[^\]\n]*\]\s*$/)) return "meta";
  // Block macro on its own line: include::file[], image::a.png[alt].
  if (stream.match(MACRO_LINE)) return "link";
  // List markers: "*", "**", "-", ".", "..", numbered "1.".
  if (stream.match(/^(\*{1,5}|\.{1,5}|-|\d+\.)\s/)) return "keyword";
  return null;
}

const adocStream = {
  name: "asciidoc",
  startState(): AdocStreamState {
    return { fence: null, fenceIsComment: false };
  },
  token(stream: StringStream, state: AdocStreamState): string | null {
    if (stream.sol()) {
      const delim = stream.string.match(BLOCK_DELIMITER)?.[1];
      if (delim) {
        stream.skipToEnd();
        if (state.fence === null) {
          state.fence = delim;
          state.fenceIsComment = delim.startsWith("/");
        } else if (state.fence[0] === delim[0]) {
          state.fence = null;
          state.fenceIsComment = false;
        }
        return state.fenceIsComment ? "comment" : "meta";
      }
      if (state.fence !== null) {
        stream.skipToEnd();
        // Comment block bodies read as comments; listing/example bodies stay
        // unpainted (their language is unknown — wrong colors beat none, NOT).
        return state.fenceIsComment ? "comment" : null;
      }
      const lineToken = tokenAtLineStart(stream, state);
      if (lineToken) return lineToken;
    }

    // Inline marks — conservative single-line matches.
    if (stream.match(/^`[^`\n]+`/)) return "string";
    if (stream.match(/^\*[^*\n]+\*/)) return "strong";
    if (stream.match(/^_[^_\n]+_/)) return "em";
    if (stream.match(/^<<[^>\n]+>>/)) return "link";
    if (stream.match(/^(xref|link):[^[\n]+\[[^\]\n]*\]/)) return "link";
    if (stream.match(/^https?:\/\/[^\s[\]]+/)) return "link";
    if (stream.match(/^\{[\w][\w-]*\}/)) return "atom";

    // Advance to the next character that could start a token; consuming runs
    // of plain text in one call keeps the tokenizer fast on large docs.
    stream.next();
    stream.eatWhile(/[^`*_<{hx]/);
    return null;
  },
};

/** AsciiDoc language support for the editor (highlighting only). */
export function asciidoc(): LanguageSupport {
  const language = StreamLanguage.define(adocStream);
  return new LanguageSupport(language);
}
