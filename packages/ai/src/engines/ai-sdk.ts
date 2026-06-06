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
    try {
      const apiKey = await getApiKey();
      const model = await buildModel(resolved, apiKey, opts?.fetch);
      const { generateText, dynamicTool, jsonSchema, stepCountIs } = await import("ai");
      const tools = toolList.length
        ? Object.fromEntries(
            toolList.map((t) => [
              t.name,
              dynamicTool({
                description: t.description ?? "",
                inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
                execute: (args: unknown) => t.execute(args),
              }),
            ]),
          )
        : undefined;
      const result = await generateText({
        model,
        ...(chatOpts?.system ? { system: chatOpts.system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(chatOpts?.signal ? { abortSignal: chatOpts.signal } : {}),
        ...(chatOpts?.temperature != null ? { temperature: chatOpts.temperature } : {}),
        ...(tools ? { tools, stopWhen: stepCountIs(chatOpts?.maxSteps ?? 8) } : {}),
      });
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
