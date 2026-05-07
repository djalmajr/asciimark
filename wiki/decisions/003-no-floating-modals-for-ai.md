---
title: "003. No floating modals for AI interactions"
status: Accepted
date: 2026-05-07
tags: [adr, ai, ux, sidebar]
---

# 003. No floating modals for AI interactions

## Context

During the AI panel prototype iteration we explored a "Cmd+I overlay" —
a floating panel that appears centered on the editor when the user
triggers an AI action (e.g. diagram generation inside a `[mermaid]`
block). The pattern is familiar from Cursor's Cmd+K overlay and
similar IDE inline-AI prompts.

In testing, this created a fragmented mental model:

- **Inline actions** (rewrite, translate, etc.) appeared in a floating
  modal
- **Workspace chat** lived in the right-gutter sidebar
- **Diagram-from-text** was in the floating modal

The user had to learn two surfaces, and content from one didn't
naturally flow into the other (e.g. you couldn't ask a follow-up after
generating a diagram without context-switching).

Cursor itself has been trending toward consolidating its AI surface
into a single panel for the same reason.

## Decision

**All AI interactions live in the right-gutter sidebar (the third
segment, `Summary | References | AI`).** No floating modals for AI.

This applies to:

- Workspace chat (cross-file Q&A with citations)
- Inline edit assist on selection (rewrite, translate, fix grammar,
  summarize)
- Diagram-from-text inside `[mermaid]` blocks
- Any future AI capability

**Context capture happens automatically:**

- When the user triggers an action with a selection active, the
  selection becomes a context chip in the AI panel composer
- When the cursor is inside a special block (`[mermaid]`,
  `[source,...]`), the block content is captured as context
- Active document is always available as implicit context

**Explicit context attachment** uses `@file` autocomplete in the
composer — typing `@` opens a fuzzy-match dropdown over the workspace
file index. Multiple `@` mentions stack as pinned chips.

## Consequences

### Positive

- **Single mental model.** Users learn one surface for all AI work.
  Chat, inline assist, and diagrams all flow into the same scrollback,
  enabling natural follow-ups.
- **Context is explicit and visible.** The user can always see what
  the AI is grounded on (chips in the composer). No hidden state.
- **Keyboard-first stays consistent.** ⌘I on a selection routes into
  the sidebar; ⌘⇧I asks about the workspace; ⌘K focuses composer. No
  separate modal-management shortcuts.
- **Streaming feels natural.** Mermaid generation streams into a
  message bubble that has "Insert into [mermaid] block" as an action,
  rather than into a modal that needs to be dismissed and the result
  copy-pasted.

### Negative / accepted trade-offs

- **Sidebar real estate is constrained** (~340 px width). We can't
  show the full editor and a wide AI panel simultaneously. Users with
  small displays may need to toggle the sidebar.
- **Diagram-from-text with the cursor in a `[mermaid]` block** is
  marginally less direct than a Cmd+I overlay right above the cursor.
  We mitigate by auto-capturing the block as the active context, so
  the user types the prompt in the sidebar and gets the result with
  one click to insert.
- **Power-user shortcut** (Cmd+I → quick prompt → result inline) is
  slightly slower than a true inline overlay. Not enough to justify
  splitting the surface.

### Neutral

- This is a UX commitment, not a technical limitation. If user
  research later shows strong demand for an inline overlay, we can
  revisit — but that's a new ADR, not a tweak to this one.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Cmd+I overlay (Cursor-style)** | Fragments the AI surface, hides context, breaks follow-up flow |
| **Bottom panel (terminal-style)** | More vertical real estate, but cuts the editor preview area; doesn't compose with split-panes UX |
| **No sidebar AI — pure inline** | Loses chat history and multi-turn refinement |
| **Both surfaces (sidebar + overlay)** | Dual surface = dual mental model. Worst of both worlds |

## Related

- ADR-002 — BM25 default tier (Off mode keeps inline actions working)
- `wiki/roadmap/ai-integration.md` § AI sidebar architecture
- Figma prototype: AI sidebar States 1-8 (all interactions in single
  panel; floating overlay was prototyped and removed)
