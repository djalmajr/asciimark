// A canned AIProvider used throughout M1 so every AI surface (sidebar chat,
// inline overlay, diagram-from-text) can be built and tested before any real
// engine, API key, or network exists. It emits the EXACT stream shape the real
// adapters will (`text-delta`* then a terminal `done`, or `error` on abort), so
// UI built against it doesn't break when a real engine is swapped in (DJA-11F).

import type {
  AIMessage,
  AIProvider,
  AIStreamPart,
  ChatOptions,
  CompleteOptions,
} from "./types.ts";
import { NotSupportedError } from "./types.ts";

export interface MockProviderOptions {
  /** Produce the reply text from the conversation. Defaults to a fixed notice. */
  reply?: (messages: AIMessage[]) => string;
  /** Delay between chunks (ms) to simulate streaming. 0 for instant (tests). */
  chunkDelayMs?: number;
  /** Whitespace-delimited tokens per emitted chunk. */
  chunkSize?: number;
}

const DEFAULT_REPLY =
  "This is a mock AI response. Configure a provider in Settings to get live answers.";

/** Split into chunks of `perChunk` tokens, preserving the original whitespace so
 *  newlines (e.g. in a generated mermaid block) survive the streaming. */
function chunkText(text: string, perChunk: number): string[] {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += perChunk) {
    chunks.push(tokens.slice(i, i + perChunk).join(""));
  }
  return chunks.length > 0 ? chunks : [text];
}

export function createMockProvider(opts: MockProviderOptions = {}): AIProvider {
  const chunkSize = opts.chunkSize ?? 3;
  const delay = opts.chunkDelayMs ?? 12;

  async function* chat(
    messages: AIMessage[],
    options?: ChatOptions,
  ): AsyncIterable<AIStreamPart> {
    if (options?.signal?.aborted) {
      yield { type: "error", code: "aborted", message: "Request aborted" };
      return;
    }
    const text = opts.reply ? opts.reply(messages) : DEFAULT_REPLY;
    for (const chunk of chunkText(text, chunkSize)) {
      if (options?.signal?.aborted) {
        yield { type: "error", code: "aborted", message: "Request aborted" };
        return;
      }
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      yield { type: "text-delta", text: chunk };
    }
    yield { type: "done", usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async function complete(
    prompt: string,
    options?: CompleteOptions,
  ): Promise<string> {
    let out = "";
    for await (const part of chat([{ role: "user", content: prompt }], options)) {
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
