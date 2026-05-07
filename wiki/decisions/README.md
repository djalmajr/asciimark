---
title: "Architecture Decision Records (ADRs)"
audience: dev
sources:
  - in-session decision 2026-05-07
updated: 2026-05-07
tags: [adr, decisions, architecture]
status: stable
---

# Architecture Decision Records

Lightweight ADRs capturing **non-negotiable** technical decisions that
persist beyond any single epic, sprint, or feature. ADRs answer
"why is it like this?" — they are the durable memory of architecture.

## When to write an ADR

Create an ADR when:

- A decision constrains future implementations (sets a non-negotiable
  pattern)
- The trade-offs took non-trivial discussion to resolve
- The decision is **not** obvious from reading the code
- Reverting the decision would require coordinated migration

**Don't** create ADRs for:

- Implementation tactics that are obvious from the code
- Temporary scaffolding or experiments
- Choices already documented in `wiki/architecture/*.md`
- Things that fit naturally as a comment near the code

## Format

Each ADR is a numbered markdown file: `NNN-short-kebab-title.md`.

```markdown
---
title: "NNN. Short title"
status: Accepted          # Accepted | Superseded by NNN | Deprecated
date: YYYY-MM-DD
tags: [adr, ...]
---

# NNN. Short title

## Context
What is the problem? What forces are at play?
What constraints exist (technical, business, regulatory)?

## Decision
What did we decide? Be concrete and unambiguous.

## Consequences

### Positive
- ...

### Negative / accepted trade-offs
- ...

### Neutral
- ...

## Alternatives considered
Brief summary of options that lost — and why.
```

## Rules

1. **Numbering is sequential and immutable.** Once an ADR has a
   number, it never moves. Even if it's superseded later, the number
   stays.

2. **ADRs are immutable in spirit.** The original decision context is
   historical. If the decision changes, create a new ADR with status
   `Accepted` that supersedes the old one. The old ADR's status flips
   to `Superseded by NNN`. Don't rewrite history.

3. **One decision per ADR.** If a single PR introduces 3 unrelated
   decisions, write 3 ADRs.

4. **Reference, don't duplicate.** Wiki architecture docs may link
   to ADRs ("see ADR-002 for why we chose X"). Code comments may link
   ("// per ADR-005, never call this off the main thread"). ADRs are
   the source.

5. **Linear issues do not contain ADRs.** Issues are ephemeral
   (closed, archived). Decisions persist independent of the issue
   that produced them. Issues link to ADRs, not the other way around.

## Index

- [001 — QMD as a Tauri sidecar](001-qmd-as-sidecar.md)
- [002 — BM25 as default indexing tier](002-bm25-default-tier.md)
- [003 — No floating modals for AI interactions](003-no-floating-modals-for-ai.md)
- [004 — Position AsciiMark as Cursor for technical writing](004-position-as-cursor-for-technical-writing.md)

## Adding a new ADR

1. Pick the next number in sequence
2. Copy the format above
3. Fill in Context / Decision / Consequences honestly
4. Add to the Index list above
5. Update `wiki/index.md` if relevant
6. Run `qmd update` after merge so the index reflects the new ADR
