// fetch shim backed by the Rust streaming command (ai_http.rs). The AI SDK's
// streamText consumes a standard streaming Response; tauri-plugin-http can't
// provide one (it buffers the whole body), so this rebuilds it: the POST runs
// in Rust, body lines arrive over an ipc Channel and are re-framed into a
// ReadableStream. Passed as the custom `fetch` to the engine when the
// streaming beta toggle is ON; the buffered tauri-http fetch stays the
// non-streaming default.

import { Channel } from "@tauri-apps/api/core";
import { invoke } from "./chaos-invoke.ts";

type StreamEvent =
  | { type: "status"; status: number; headers: Record<string, string> }
  | { type: "line"; line: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Normalize HeadersInit (Headers | array | record) into a plain record. */
function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...headers };
}

export function streamingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const callId = crypto.randomUUID();
  const signal = init?.signal ?? undefined;
  const encoder = new TextEncoder();

  return new Promise<Response>((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let settled = false;

    const onAbort = () => {
      void invoke("ai_http_stream_cancel", { callId }).catch(() => {});
      const err = new DOMException("Aborted", "AbortError");
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        try {
          controller?.error(err);
        } catch {
          // stream already closed
        }
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const finish = () => signal?.removeEventListener("abort", onAbort);

    const channel = new Channel<StreamEvent>();
    channel.onmessage = (event) => {
      switch (event.type) {
        case "status": {
          const body = new ReadableStream<Uint8Array>({
            start(c) {
              controller = c;
            },
            cancel() {
              void invoke("ai_http_stream_cancel", { callId }).catch(() => {});
            },
          });
          settled = true;
          resolve(new Response(body, { headers: event.headers, status: event.status }));
          break;
        }
        case "line":
          controller?.enqueue(encoder.encode(`${event.line}\n`));
          break;
        case "done":
          finish();
          try {
            controller?.close();
          } catch {
            // already closed/errored
          }
          break;
        case "error": {
          finish();
          const err = new TypeError(event.message);
          if (!settled) {
            settled = true;
            reject(err);
          } else {
            try {
              controller?.error(err);
            } catch {
              // already closed
            }
          }
          break;
        }
      }
    };

    void invoke("ai_http_stream", {
      request: {
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: toHeaderRecord(init?.headers),
        method: init?.method ?? "POST",
        url,
      },
      callId,
      onEvent: channel,
    }).catch((e: unknown) => {
      finish();
      if (!settled) {
        settled = true;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}
