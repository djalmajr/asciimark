import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createMockProvider } from "@asciimark/ai/mock-provider.ts";
import { createAiChatStore } from "../composables/create-ai-chat-store.ts";
import { AiPanel } from "./ai-panel.tsx";
import { AiMessage } from "./ai-message.tsx";

afterEach(cleanup);

function readyStore(reply = "hello there") {
  return createAiChatStore({
    getProvider: () => createMockProvider({ reply: () => reply, chunkDelayMs: 0 }),
  });
}

describe("AiPanel", () => {
  it("shows the empty state with no messages and no provider", () => {
    const store = createAiChatStore({ getProvider: () => null });
    const { baseElement } = render(() => <AiPanel store={store} providerLabel={null} />);
    expect(baseElement.querySelector(".ai-empty")).not.toBeNull();
    expect(baseElement.querySelector(".ai-message")).toBeNull();
    // chip shows the inactive (no-provider) state
    expect(baseElement.querySelector(".ai-provider-chip-active")).toBeNull();
  });

  it("marks the provider chip active when a label is given", () => {
    const store = readyStore();
    const { baseElement } = render(() => <AiPanel store={store} providerLabel="Ollama" />);
    expect(baseElement.querySelector(".ai-provider-chip-active")).not.toBeNull();
  });

  it("disables Send while the composer is empty", () => {
    const store = readyStore();
    const { baseElement } = render(() => <AiPanel store={store} providerLabel="Mock" />);
    const btn = baseElement.querySelector(".ai-composer-actions button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("streams a reply on Enter, consolidates it, and hides the empty state", async () => {
    const store = readyStore("hello there");
    const { baseElement } = render(() => <AiPanel store={store} providerLabel="Mock" />);
    const textarea = baseElement.querySelector(".ai-composer-input") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(baseElement.textContent).toContain("hello there");
    });
    expect(baseElement.querySelector(".ai-message-user")).not.toBeNull();
    expect(baseElement.querySelector(".ai-message-assistant")).not.toBeNull();
    expect(baseElement.querySelector(".ai-empty")).toBeNull();
    // composer cleared after send
    expect(textarea.value).toBe("");
  });

  it("renders tool chips (name + source) for a message with tool activity", () => {
    const { baseElement } = render(() => (
      <AiMessage
        role="assistant"
        content="done"
        tools={[
          {
            toolCallId: "t1",
            toolName: "search_docs",
            source: "memory",
            status: "done",
          },
        ]}
      />
    ));
    const chip = baseElement.querySelector(".ai-tool-chip");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("search_docs");
    expect(chip?.textContent).toContain("memory");
    expect(baseElement.querySelector(".ai-tool-chip-done")).not.toBeNull();
  });
});
