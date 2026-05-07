---
title: "004. Position AsciiMark as Cursor for technical writing"
status: Accepted
date: 2026-05-07
tags: [adr, positioning, business, ai]
---

# 004. Position AsciiMark as Cursor for technical writing

## Context

While exploring AI assistant features (see ADR-001 to ADR-003), the
question of how AsciiMark positions itself in the broader landscape
became unavoidable. The realistic options were:

1. **Generic Cursor parity** — try to be a general-purpose AI-powered
   editor across code + docs.
2. **Cursor for technical writing / wiki / documentation** — niche
   into docs, wikis, technical writing. Use AsciiMark's existing
   ground (AsciiDoc + Markdown rendering, file-graph navigation,
   workspace symbols, backlinks) as the foundation that AI amplifies.
3. **Pure Markdown viewer + extras** — stay narrow on rendering,
   skip AI entirely.

Cursor is the state of the art at code edit-assist. Competing there
commoditizes our work and ignores what AsciiMark is already
distinctive at: rendering and navigating long-form technical content
across many files.

Obsidian's Smart Connections does cross-document AI but without
citation grounding, and Notion AI is cloud-only — neither hits
"local-first technical writer with grounded RAG."

## Decision

**Position AsciiMark as the IDE for technical writing — local-first,
workspace-aware, AI-native — for docs, wikis, and knowledge bases.**

This is the canonical pitch. Every product and engineering decision
defaults to this framing. It is the "why" behind the AI scope (chat
grounded in workspace docs, diagram-from-text, inline actions on
prose) and behind specific decisions to **not** build certain things
(IDE-style code intelligence, generic refactoring, code-specific
language servers).

Concretely, this means:

- **In scope:** anything that improves writing, navigation, citation,
  and rendering in `.md` / `.adoc` / `.asciidoc` content.
- **Out of scope:** code-edit features that already have first-class
  IDE answers (Cursor, VSCode, JetBrains).
- **Differentiator stack:**
  - Local-first identity (no cloud requirement; Ollama as first-class)
  - Cited cross-file AI answers (workspace as the corpus)
  - Diagram-from-text (mermaid generation as a killer demo)
  - Existing rich rendering (AsciiDoc + Markdown + Mermaid + Kroki + KaTeX)

## Consequences

### Positive

- **Clear "no" answers.** When asked "should we add X?", we can
  reject features fast if they don't make a technical writer's job
  better. Cursor competes on speed of feature parity; we compete on
  fit to a niche.
- **Marketing narrative is honest.** We can lean into the
  "AsciiDoc + Markdown + AI for docs" story without weasel
  qualifications. Search-engine answers ("best Markdown editor with
  workspace AI") have a single coherent mental model to match.
- **Roadmap converges.** ADR-001 (QMD sidecar), ADR-002 (BM25
  default), ADR-003 (no floating modals), and the eventual SKILLS
  feature all serve the same pitch instead of pulling in three
  directions.

### Negative / accepted trade-offs

- **Smaller TAM.** "Technical writers + dev teams maintaining wikis"
  is smaller than "all developers." Acceptable: niche markets that
  hit are deeper than broad markets that don't.
- **Defaults disappoint code-first users.** Someone hoping AsciiMark
  is "Cursor but for docs **and** code" will find the code edge
  thin. We need to communicate the niche clearly in marketing.
- **AI feature parity will lag Cursor.** No autocomplete-mid-line,
  no codebase-wide refactor planning. We don't try to build that.

### Neutral

- The MVP scope (M1-M3 in Linear Project AsciiMark — AI Assistant)
  was already informed by this positioning, but it had not been
  formalized as an ADR. This document captures the decision so future
  contributors can see the reasoning.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Generic Cursor parity** | Commoditized. Cursor wins on every code edit-assist axis we'd contest, and we lose the niche identity that makes "why AsciiMark over X?" answerable |
| **Pure Markdown viewer + extras (no AI)** | Leaves the biggest amplifier on the table. The whole AI roadmap (ADR-001/002/003) becomes wasted optionality |
| **Hybrid (try to do both)** | Two halves of an unfinished product. Either half slower than focused competitors |

## Related

- ADR-001 — QMD as Tauri sidecar (technical foundation for grounded AI)
- ADR-002 — BM25 as default indexing tier (UX trade-offs that fit the
  niche: install-and-go for technical writers)
- ADR-003 — No floating modals for AI (UX coherence)
- Linear Initiative: [AsciiMark — Local-first technical writing](https://linear.app/djalmajr/initiative/asciimark-local-first-technical-writing-d6530b5d2e4c)
