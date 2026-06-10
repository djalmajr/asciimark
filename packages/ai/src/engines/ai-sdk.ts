// Vercel AI SDK engine (DJA-11F). Maps the AIProvider contract onto the AI SDK
// `streamText`, lazily importing the SDK + the per-`kind` adapter so nothing is
// bundled until this engine is actually used. Runs in the webview; the API key
// is resolved just-in-time via `getApiKey` and never held longer than a request.
//
// CORS: WKWebView blocks direct cross-origin fetches to provider APIs, so the
// host injects a `fetch` that routes through Rust (Tauri HTTP plugin).
//
// Errors: in AI SDK v6 `streamText` does NOT throw on the `textStream` — failures
// surface on `fullStream` as `{type:"error"}`. We iterate `fullStream` so auth /
// network / rate-limit errors reach the UI instead of a silent empty reply.

import type { LanguageModel } from "ai";
import { withApproval } from "../approval-policy.ts";
import { compactMessages } from "../compaction.ts";
import type { AIEngine, AIEngineOptions, CredentialResolver } from "../engine.ts";
import type { ResolvedModel } from "../resolve-model.ts";
import type {
  AIErrorCode,
  AIMessage,
  AIProvider,
  AIStreamPart,
  ChatOptions,
  CompleteOptions,
} from "../types.ts";
import { NotSupportedError } from "../types.ts";

/**
 * Context compaction threshold, in MESSAGES. Before each provider call the
 * history is capped at this many messages, dropping the oldest at a
 * `safeCutIndex` boundary (leading system messages are always kept).
 *
 * Why a message count and not a char/token budget: the engine receives plain
 * `AIMessage[]` turns (one string per user/assistant turn, built by the chat
 * store), so a count is cheap, deterministic and model-agnostic — a real token
 * budget would need a per-model tokenizer this package deliberately avoids.
 * 200 messages ≈ 100 turns, generous enough that compaction only kicks in on
 * truly long sessions. The SDK's `pruneMessages` was evaluated and does not
 * fit: it prunes message CONTENT by kind (reasoning / tool parts), not the
 * oldest N turns (see compaction.ts).
 */
export const MAX_CONTEXT_MESSAGES = 200;

async function buildModel(
  resolved: ResolvedModel,
  apiKey: string | undefined,
  fetchImpl: AIEngineOptions["fetch"],
): Promise<LanguageModel> {
  const { modelId, providerId, provider } = resolved;
  const baseURL = provider.options?.baseURL;
  const headers = provider.options?.headers;
  // The AI SDK's FetchFunction is structurally the global fetch; the Tauri HTTP
  // plugin fetch is compatible at runtime.
  const fetch = fetchImpl as Parameters<typeof import("@ai-sdk/openai-compatible").createOpenAICompatible>[0]["fetch"];
  const fetchOpt = fetchImpl ? { fetch } : {};

  switch (provider.kind) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...fetchOpt,
        // Required for direct browser/webview calls to the Anthropic API.
        headers: {
          "anthropic-dangerous-direct-browser-access": "true",
          ...(headers ?? {}),
        },
      })(modelId);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...(headers ? { headers } : {}),
        ...fetchOpt,
      })(modelId);
    }
    case "openai-compatible": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      return createOpenAICompatible({
        name: providerId,
        baseURL: baseURL ?? "",
        ...(apiKey ? { apiKey } : {}),
        ...(headers ? { headers } : {}),
        ...fetchOpt,
      })(modelId);
    }
  }
}

/** Map an SDK / network error to the AIStreamPart error taxonomy so the UI can
 *  show a dedicated message (esp. "Ollama offline" — a refused connection). */
function classifyError(e: unknown): { code: AIErrorCode; message: string } {
  const err = e as {
    name?: string;
    statusCode?: number;
    status?: number;
    message?: string;
  };
  const name = err?.name ?? "";
  const status = err?.statusCode ?? err?.status;
  const message = err?.message ?? String(e);
  if (name === "AbortError" || /abort/i.test(message)) {
    return { code: "aborted", message: "Request aborted" };
  }
  if (status === 401 || status === 403) return { code: "auth", message };
  if (status === 429) return { code: "rate_limit", message };
  if (status === 404) return { code: "not_found", message };
  if (/\bcors\b/i.test(message)) return { code: "cors", message };
  if (
    /fetch failed|network|econnrefused|failed to fetch|load failed|connection refused/i.test(
      message,
    )
  ) {
    return { code: "network", message };
  }
  return { code: "unknown", message };
}

/** A loosely-typed AI SDK `fullStream` part — we read only the fields we map. */
type FullStreamPart = { type: string } & Record<string, unknown>;

/**
 * Map an AI SDK v6 `streamText().fullStream` onto our `AIStreamPart` contract,
 * owning the single terminal emission: an `error`/`abort` part yields one error
 * and STOPS the stream (no trailing `done`); otherwise a `done` is emitted after
 * the loop, carrying usage from the `finish` part. Unknown part types
 * (text-start/-end, reasoning-*, tool-input-*, source, file, step boundaries,
 * raw, ...) are intentionally ignored. Pure over the input — unit-testable.
 */
export async function* mapFullStream(
  fullStream: AsyncIterable<FullStreamPart>,
  sourceByName?: Map<string, string | undefined>,
): AsyncIterable<AIStreamPart> {
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  for await (const part of fullStream) {
    switch (part.type) {
      case "text-delta": {
        const text = (part.text ?? part.textDelta) as string | undefined;
        if (text) yield { type: "text-delta", text };
        break;
      }
      case "tool-call":
        yield {
          type: "tool-call",
          toolCallId: part.toolCallId as string,
          toolName: part.toolName as string,
          source: sourceByName?.get(part.toolName as string),
          args: part.input,
        };
        break;
      case "tool-result":
        yield {
          type: "tool-result",
          toolCallId: part.toolCallId as string,
          toolName: part.toolName as string,
          result: part.output,
        };
        break;
      case "tool-error":
        yield {
          type: "tool-result",
          toolCallId: part.toolCallId as string,
          toolName: part.toolName as string,
          result: part.error,
          isError: true,
        };
        break;
      case "error":
        yield { type: "error", ...classifyError(part.error) };
        return; // own the terminal — no trailing done
      case "abort":
        yield { type: "error", code: "aborted", message: "Request aborted" };
        return;
      case "tool-output-denied":
        // Only emitted if a tool sets the SDK's loop-level `needsApproval`, which
        // AsciiMark does NOT (approval is the execute-wrapper in approval-policy.ts,
        // applied by the engine when ChatOptions.onApprovalRequest is set — see
        // the gating note in chat() for why native needsApproval is deferred).
        // Mapped defensively so a denial is never invisible if that ever changes.
        yield {
          type: "tool-result",
          toolCallId: part.toolCallId as string,
          toolName: part.toolName as string,
          result: { rejected: true },
          isError: true,
        };
        break;
      case "finish":
        usage = (part.totalUsage ?? part.usage) as typeof usage;
        break;
      default:
        // Non-mapped parts (text-start/-end, reasoning-*, tool-input-*, source,
        // file, step boundaries, raw, and tool-approval-request — unreachable as
        // long as approval stays in the execute-wrapper) are intentionally ignored.
        break;
    }
  }
  yield {
    type: "done",
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
  };
}

/** Split completed text into ~3-token chunks (whitespace preserved) so the UI
 *  renders it with a live-typing feel even though the HTTP request was
 *  non-streaming. */
function chunkForTyping(text: string, perChunk = 3): string[] {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += perChunk) {
    chunks.push(tokens.slice(i, i + perChunk).join(""));
  }
  return chunks.length > 0 ? chunks : [text];
}

function createProvider(
  resolved: ResolvedModel,
  getApiKey: CredentialResolver,
  opts?: AIEngineOptions,
): AIProvider {
  async function* chat(
    messages: AIMessage[],
    chatOpts?: ChatOptions,
  ): AsyncIterable<AIStreamPart> {
    // The HTTP request is NON-streaming: the Tauri HTTP plugin (used to dodge
    // the WKWebView CORS wall) doesn't surface SSE incrementally. We fetch the
    // full completion, then re-emit it in small chunks for a live-typing feel.
    // When tools are supplied the SDK runs a multi-step tool-calling loop; the
    // whole loop resolves before we get `result`, so tool activity is surfaced
    // from `result.steps` after the fact (in order: all tools, then final text).
    let text: string;
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    // Structural type for the slice of StepResult we read — keeps the SDK out
    // of the contract while staying assignable from `result.steps`.
    type ToolStep = {
      toolCalls: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
      toolResults: ReadonlyArray<{ toolCallId: string; toolName: string; output: unknown }>;
    };
    let steps: ReadonlyArray<ToolStep> = [];
    const toolList = chatOpts?.tools ?? [];
    const sourceByName = new Map(toolList.map((t) => [t.name, t.source]));
    // Engine-level human-in-the-loop (DJA F3): when the host supplies
    // `onApprovalRequest`, the engine gates every prompt-tier tool itself via
    // the same pure `withApproval` wrapper hosts used to apply — auto-tier
    // tools pass through untouched and a denial resolves to the model-visible
    // `{ rejected: true, error }` result the chat UI already renders. Without
    // the callback, tools run exactly as given (hosts that still pre-wrap keep
    // today's behavior; no double-gating).
    //
    // Why not the SDK's native `needsApproval` (ai@6 / @ai-sdk/provider-utils):
    // `Tool.needsApproval: boolean | ToolNeedsApprovalFunction` makes
    // generateText/streamText HALT the loop with a `tool-approval-request`
    // content part; execution resumes only when the caller appends a tool
    // message carrying a `tool-approval-response` part and issues a NEW
    // generate call (the UI-side `lastAssistantMessageIsCompleteWithApproval
    // Responses` helper exists precisely to drive that resubmission). Our
    // `AIProvider.chat` is a single-call contract over plain-text AIMessages —
    // approval parts cannot round-trip through the host history — and a native
    // denial surfaces as `tool-output-denied` instead of the `{ rejected }`
    // result shape the chat store expects. The in-execute gate is the smaller
    // correct step until the contract carries structured history.
    const onApprovalRequest = chatOpts?.onApprovalRequest;
    const gatedTools = onApprovalRequest
      ? toolList.map((t) => withApproval(t, onApprovalRequest))
      : toolList;
    // Compaction: cap the history BEFORE the provider call, dropping the
    // oldest messages at a boundary that never splits a tool call from its
    // result (and pinning leading system messages). See MAX_CONTEXT_MESSAGES
    // for why the budget is a message count.
    const history = compactMessages(messages, MAX_CONTEXT_MESSAGES);
    try {
      const apiKey = await getApiKey();
      const model = await buildModel(resolved, apiKey, opts?.fetch);
      const ai = await import("ai");
      const tools = gatedTools.length
        ? Object.fromEntries(
            gatedTools.map((t) => [
              t.name,
              ai.dynamicTool({
                description: t.description ?? "",
                inputSchema: ai.jsonSchema(t.inputSchema as Parameters<typeof ai.jsonSchema>[0]),
                execute: (args: unknown, { abortSignal }: { abortSignal?: AbortSignal }) =>
                  t.execute(args, { signal: abortSignal }),
              }),
            ]),
          )
        : undefined;
      const common = {
        model,
        ...(chatOpts?.system ? { system: chatOpts.system } : {}),
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        ...(chatOpts?.signal ? { abortSignal: chatOpts.signal } : {}),
        ...(chatOpts?.temperature != null ? { temperature: chatOpts.temperature } : {}),
        ...(tools ? { tools, stopWhen: ai.stepCountIs(chatOpts?.maxSteps ?? 8) } : {}),
      };

      // Streaming path (opt-in): real incremental deltas via `fullStream`,
      // smoothed to word boundaries. `mapFullStream` owns the terminal. If the
      // injected fetch doesn't surface SSE incrementally (the A0 question),
      // smoothStream still yields a typing feel; if it hangs, the default
      // buffered path below is the kill-switch.
      if (opts?.streaming) {
        const result = ai.streamText({
          ...common,
          experimental_transform: ai.smoothStream({ chunking: "word" }),
        });
        yield* mapFullStream(result.fullStream as AsyncIterable<FullStreamPart>, sourceByName);
        return;
      }

      const result = await ai.generateText(common);
      text = result.text;
      // `totalUsage` sums every step; `usage` is only the last step (undercounts
      // multi-step tool loops).
      usage = result.totalUsage;
      steps = result.steps;
    } catch (e) {
      yield { type: "error", ...classifyError(e) };
      return;
    }

    for (const step of steps) {
      for (const call of step.toolCalls) {
        yield {
          type: "tool-call",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          source: sourceByName.get(call.toolName),
          args: call.input,
        };
      }
      for (const res of step.toolResults) {
        yield {
          type: "tool-result",
          toolCallId: res.toolCallId,
          toolName: res.toolName,
          result: res.output,
        };
      }
    }

    for (const chunk of chunkForTyping(text)) {
      if (chatOpts?.signal?.aborted) {
        yield { type: "error", code: "aborted", message: "Request aborted" };
        return;
      }
      yield { type: "text-delta", text: chunk };
      await new Promise((r) => setTimeout(r, 10));
    }
    yield {
      type: "done",
      usage: {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    };
  }

  async function complete(prompt: string, completeOpts?: CompleteOptions): Promise<string> {
    let out = "";
    for await (const part of chat([{ role: "user", content: prompt }], completeOpts)) {
      if (part.type === "text-delta") out += part.text;
    }
    return out;
  }

  return {
    chat,
    complete,
    embed(): Promise<number[][]> {
      return Promise.reject(new NotSupportedError("embed"));
    },
  };
}

export const aiSdkEngine: AIEngine = { id: "ai-sdk", createProvider };
