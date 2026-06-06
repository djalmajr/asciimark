// TanStack AI engine.
//
// Real implementation lands in DJA-11F. TanStack AI is designed for a
// client↔server split (useChat → endpoint), so in our serverless Tauri webview
// we run the core `chat()` in-process via a custom `stream()` transport: lazy
// `import()` of @tanstack/ai + @tanstack/ai-{anthropic,openai,...} keyed by
// `resolved.provider.kind`, build the adapter with baseURL + the resolved key,
// and map TanStack's stream onto AIStreamPart. Placeholder for now so the
// engine is interchangeable with "ai-sdk" the moment it's implemented.

import type { AIEngine } from "../engine.ts";

export const tanstackEngine: AIEngine = {
  id: "tanstack",
  createProvider() {
    throw new Error(
      "tanstack engine not yet wired (DJA-11F). M1 runs on the mock provider; " +
        "implement engines/tanstack.ts (in-process stream() transport) to go live.",
    );
  },
};
