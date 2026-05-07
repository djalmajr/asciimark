# AsciiMark — wiki

Local knowledge base. Sourced from this repo only; agents use it via
QMD semantic search instead of grepping the source tree blindly.

## Topics

### Process & decisions

- [Linear workflow](process/linear-workflow.md) — Linear is the source of truth for plans/work; wiki holds durable knowledge. Hierarchy, templates, labels, end-to-end flow, ownership rule.
- [Decisions index (ADRs)](decisions/README.md) — non-negotiable technical decisions with context + consequences. Includes ADR-004 (positioning as Cursor for technical writing), ADR-001/002/003 (AI architecture).

### Architecture

- [Architecture overview](architecture/overview.md) — apps + packages
- [i18n architecture](architecture/i18n.md) — Paraglide + Solid adapter, `(useLocale(), m.foo())` pattern, locale detection, parity gate
- [Desktop updater](architecture/desktop-updater.md) — pending-update signal, custom scrollable modal (vs native `ask()`), tray-close coordination
- [Keyboard shortcuts — three-source rule](architecture/keyboard-shortcuts.md) — every binding lands in catalog + handler + command palette in the same change; OS-reserved keys table
- [Preview pipeline](architecture/preview-pipeline.md) — render order (sanitize → highlight → swap → paint → mermaid/kroki), mermaid first-render fix, cross-file nav → TOC active sync
- [IPC contract](architecture/ipc.md) — Rust ↔ Solid commands

### Testing

- [Testing strategies](testing/strategies.md) — rationale per technique (Tier 1/2 + Round 1-6 lessons)
- [Testing operations](testing/operations.md) — how to run every gate
- [Test conventions](testing/conventions.md) — naming, layout, markers

### Performance & release

- [Performance targets](performance/targets.md) — perf gates and benches
- [Release flow](release/flow.md) — desktop: bump → tag → publish (Tauri auto-update)
- [Extension release](release/extension.md) — Chrome Web Store: bump → build → zip → upload

### Plans & in-flight work

Plans, epics, stories, and milestones live in **Linear**, not the wiki. See `process/linear-workflow.md` for the workflow. Active surfaces:

- [Initiative · AsciiMark — Local-first technical writing](https://linear.app/djalmajr/initiative/asciimark-local-first-technical-writing-d6530b5d2e4c)
- Project · [AsciiMark — AI Assistant (MVP)](https://linear.app/djalmajr/project/asciimark-ai-assistant-mvp-79c7765cf4c9) (DJA-11..21, M1/M2/M3)
- Project · [AsciiMark — AI Assistant Phase 2+](https://linear.app/djalmajr/project/asciimark-ai-assistant-phase-2-b40e8b47a02e) (DJA-22..27)
- Project · [AsciiMark — Technical debt & polish](https://linear.app/djalmajr/project/asciimark-technical-debt-and-polish-4009b2920302) (DJA-28..37)

## How the wiki is indexed

`scripts/wiki-init.ts install` configured a local QMD collection
called `asciimark` rooted at `./wiki`. Run `qmd update` to reindex
after edits, `qmd embed` to refresh embeddings.

## Boundaries

- The wiki is **prose**: rationale, decisions, conventions, indexes.
- Code lives outside the wiki. Code-level docs (`README.md` in
  subdirs) are reference; the wiki points at them.
- Issues are still the source of truth for individual plan/work items
  (`gh issue list --repo djalmajr/asciimark`); the wiki is for the
  durable knowledge that survives the issue.
