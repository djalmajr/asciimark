---
title: "001. QMD as a Tauri sidecar"
status: Accepted
date: 2026-05-07
tags: [adr, ai, indexing, qmd, architecture]
---

# 001. QMD as a Tauri sidecar

## Context

The AI assistant feature requires retrieval over the user's workspace
(markdown + AsciiDoc files) to provide RAG-style answers with citations
to specific files and lines. Building this from scratch — chunking,
BM25, embeddings, reranking, persistence, incremental sync — is 2-3
months of qualified work and is exactly the kind of solved-problem we
should not reinvent.

[QMD (github.com/tobi/qmd)](https://github.com/tobi/qmd) is a local
hybrid search engine for markdown that combines BM25 + vector
similarity + LLM reranking, runs entirely on-device via
node-llama-cpp, and ships an MCP server. It's already used by the
`wiki-init`/`wiki-query` skills in our org and by the Linear/AsciiMark
wikis themselves.

The relevant question is **how** to integrate QMD into AsciiMark, not
**whether**. The options:

1. **Bundle node-llama-cpp + QMD core directly inside the Tauri app.**
   Maximum integration, zero external runtime. But pulls a heavy
   native binary into the bundle (~50 MB+), tightly couples the
   release cadence of AsciiMark to QMD's, and we'd be the ones
   debugging GGUF model issues on user machines.

2. **Run QMD as a sidecar process** spawned by Tauri. Keeps
   node-llama-cpp out of our binary. Daemon owns model loading and
   caching. We talk JSON-RPC over `localhost:8181` via the QMD MCP
   HTTP daemon mode.

3. **Require the user to install QMD globally.** Lowest implementation
   cost, but breaks the "install and run" UX promise. Non-starter
   for a desktop app pitched at non-developers.

## Decision

**Bundle QMD as a Tauri sidecar.** Spawn `qmd mcp --http --daemon` on
demand when the AI assistant first needs retrieval. Talk JSON-RPC at
`localhost:8181`. Model GGUFs are cached once per user under
`~/.cache/asciimark/qmd/` (writable by the daemon, read by other
sessions).

Per-workspace collections are created on demand:
`qmd collection add <workspace-root> --name <workspace-hash> --mask "**/*.{md,adoc}"`.
Cache files live under `~/.cache/asciimark/qmd/<workspace-hash>.sqlite`.

## Consequences

### Positive

- **Bundle stays light.** node-llama-cpp + native deps stay outside
  the Tauri binary. AsciiMark ships ~50-80 MB lighter.
- **Decoupled release cadence.** We can update QMD independent of
  AsciiMark releases — daemon binary is replaced separately.
- **Reuses upstream investment.** Tobi Lütke's team and the QMD
  community own the hard parts (chunking, BM25, embedding pipeline,
  reranker selection, persistence schema).
- **Local-first story preserved.** Daemon runs on `localhost`. Models
  are local. Zero telemetry.
- **MCP-native.** QMD already speaks MCP over stdio and HTTP — our
  client code talks the same protocol the rest of the org uses for
  wiki queries.

### Negative / accepted trade-offs

- **+30-50 MB sidecar binary** in the macOS/Linux/Windows bundles.
  Acceptable cost for the feature.
- **Dependency on QMD's release cadence.** If QMD breaks an MCP
  contract, we're blocked until upstream fixes or we pin a version.
  Mitigated by pinning a specific QMD version in our Tauri sidecar
  manifest.
- **Process management complexity.** Tauri must spawn, supervise,
  and gracefully shut down the daemon. Daemon must survive sleep/wake
  cycles, multiple AsciiMark windows, and forced quits.
- **First-run latency.** Spawning the daemon takes 1-2 seconds; the
  first query has cold model load (~5-10s for embedding model on
  Full tier). Acceptable because indexing tiers are opt-in
  (see ADR-002).

### Neutral

- The QMD daemon is a Node binary. We carry a Node runtime in the
  sidecar but it's isolated from our Bun-based monorepo build.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Embed node-llama-cpp directly** | Bundle bloat, native build complexity, owning GGUF debugging on user machines |
| **Require global QMD install** | Breaks desktop UX promise, non-starter for non-developer users |
| **Build retrieval from scratch** | 2-3 months of work to reach feature parity with QMD's hybrid approach |
| **Use a cloud-based RAG API** | Conflicts with local-first identity and zero-telemetry promise |

## Related

- ADR-002 — BM25 as default indexing tier (defers heavy model
  downloads to opt-in)
- `wiki/roadmap/ai-integration.md` — feature-level scope and
  positioning
- QMD upstream: <https://github.com/tobi/qmd>
- QMD setup notes (sibling skills repo): `~/Developer/zommehq/skills/docs/wiki/qmd-setup.md`
