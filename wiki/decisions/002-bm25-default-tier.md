---
title: "002. BM25 as default indexing tier"
status: Accepted
date: 2026-05-07
tags: [adr, ai, indexing, qmd, ux]
---

# 002. BM25 as default indexing tier

## Context

QMD (see ADR-001) supports three retrieval strategies stacked: BM25
keyword search, vector similarity (via local GGUF embedding model),
and LLM reranking. Each layer adds quality but also cost — most
notably, vector + reranker requires downloading multi-hundred-MB GGUF
models on first use.

For an app whose pitch is "local-first technical writer," the cost
profile of "install AsciiMark → it downloads 600 MB of AI models on
first launch" is a real friction point. Most documentation use cases
("where do I mention X?", "show me docs about Y") are solved by BM25
alone with no semantic layer. The semantic + reranker layer matters
for **conceptual** queries on **noisy** workspaces (>200 docs).

We need a tier model that lets users opt into heavier capabilities
explicitly, with the default being lightweight enough to feel
"already installed."

## Decision

Three indexing tiers, exposed in `Settings → Workspace indexing`:

| Tier | Footprint | Behavior |
|---|---|---|
| **Off** | 0 MB | No background indexing. AI sees only the active document plus selection. Inline actions still work. |
| **Lite — BM25** (default, recommended) | ~5 MB | Fast keyword index of every `.md`/`.adoc`. Cites docs by exact-term match. **Zero model downloads.** |
| **Full — semantic + reranking** | ~400 MB | Adds vector embeddings (Qwen3-Embedding-0.6B-Q4) + reranker. Best answers for conceptual queries. Downloads on first activation. |

**Lite is the default for new installations.** A user who installs
AsciiMark and opens a workspace gets keyword-cited cross-file answers
within seconds, with no surprises.

**Off** keeps the "AI is fully off" option for users who don't want
any background process, while **inline actions** (rewrite, translate,
fix grammar, summarize, mermaid generation) keep working — those
depend only on the active document, not the index. See ADR-003 for
why these behaviors are decoupled.

**Full** is opt-in. The first time the user toggles it, AsciiMark
shows a first-run modal:
- Phase 1: Download embedding model (~412 MB, progress bar)
- Phase 2: Build keyword index (BM25 over all docs)
- Phase 3: Generate embeddings (vector index)

The user can cancel or fall back to Lite mid-flow.

## Consequences

### Positive

- **Install-and-go.** Default install never downloads models. Lite
  tier is fast, cheap, and useful for the most common queries.
- **Honest costs.** Users see footprint upfront (`0 MB`, `~5 MB`,
  `~400 MB`) before opting in.
- **Graceful degradation.** Off tier doesn't disable AI — only the
  workspace-level retrieval. Inline actions keep working, with a
  banner explaining the limitation.
- **Reranker condicional.** Even on Full, the reranker LLM only
  runs when retrieval returns >15 candidates (small workspaces skip
  it). Saves CPU on the common case.

### Negative / accepted trade-offs

- **Lite cannot answer "conceptual" questions** ("how is concurrency
  handled here?") that require semantic similarity. The UI must
  communicate this honestly without nagging. We do this with a
  one-line hint in chat responses when relevance scores are low.
- **Three tiers is more UI complexity** than two. Some users will
  pick Off because they don't want anything; others will pick Full
  because "more is better." The tier card UI (with footprint and
  capability bullets) is designed to make the trade-off visible at
  decision time.
- **Per-workspace state.** Each workspace root is a separate QMD
  collection. Switching roots is fast (cache is per-hash) but the
  user must understand that "the index" is workspace-scoped.

### Neutral

- The chosen embedding model (Qwen3-Embedding-0.6B-Q4) is multilingual
  by design. Pt-BR, en, es content all index well. If quality is
  insufficient on specific languages later, the model is a
  configuration variable.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Always-on Full** | Forces model download on first launch — breaks "install-and-go" |
| **No Lite tier (only Off / Full)** | Too binary. Most users want some retrieval without the 400 MB cost |
| **Auto-upgrade Lite → Full when workspace grows** | Hidden cost surprise — user wakes up and AsciiMark is downloading 400 MB |
| **Cloud-hosted retrieval as fallback** | Breaks local-first promise |

## Related

- ADR-001 — QMD as Tauri sidecar (the engine these tiers run on)
- ADR-003 — No floating modals for AI (why inline actions are
  decoupled from indexing)
- `wiki/roadmap/ai-integration.md` § indexing tiers
- Figma prototype: Settings · Workspace indexing modal
