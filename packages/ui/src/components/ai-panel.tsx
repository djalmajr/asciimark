import {
  For,
  Show,
  createEffect,
  createSignal,
  type JSX,
} from "solid-js";
import * as m from "@asciimark/i18n";
import { useLocale } from "@asciimark/i18n/solid";
import IconSparkles from "~icons/lucide/sparkles";
import type { AiChatStore } from "../composables/create-ai-chat-store.ts";
import { Button } from "./ui/button.tsx";
import { AiMessage } from "./ai-message.tsx";

export interface AiPanelProps {
  store: AiChatStore;
  /** Increment to focus the composer (driven by ⌘L via the host). */
  focusTrigger?: number;
  /** Display label for the active provider, or null when none is configured. */
  providerLabel?: string | null;
  /** Opens Settings → AI (empty-state CTA). Optional until DJA-15 wires it. */
  onOpenSettings?: () => void;
}

/**
 * The AI sidebar chat shell (DJA-12). Self-contained flex column — header +
 * scrollable messages + composer — so it fills the TocPanel's AI pane directly.
 * Reads everything from `props.store` (the shared chat store); knows nothing
 * about providers or IPC. Runs against the MockProvider in M1.
 */
export function AiPanel(props: AiPanelProps): JSX.Element {
  const [input, setInput] = createSignal("");
  let textarea: HTMLTextAreaElement | undefined;
  let scroller: HTMLDivElement | undefined;

  // Focus the composer when the host pulses focusTrigger (⌘L).
  createEffect(() => {
    props.focusTrigger;
    textarea?.focus();
  });

  // Keep the latest message in view as content streams in.
  createEffect(() => {
    props.store.messages();
    props.store.streamingText();
    queueMicrotask(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  });

  function submit(): void {
    const text = input();
    if (!text.trim() || props.store.streaming()) return;
    setInput("");
    void props.store.sendMessage(text);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      setInput("");
    }
  }

  const hasConversation = (): boolean =>
    props.store.messages().length > 0 || props.store.streaming();

  return (
    <div class="ai-panel">
      <div class="ai-panel-header">
        <span class="ai-panel-title">{(useLocale(), m.ai_panel_title())}</span>
        <span
          class="ai-provider-chip"
          classList={{ "ai-provider-chip-active": !!props.providerLabel }}
        >
          <span class="ai-provider-dot" aria-hidden="true" />
          {props.providerLabel ?? (useLocale(), m.ai_provider_none())}
        </span>
      </div>

      <div class="ai-messages" ref={(el) => (scroller = el)}>
        <Show when={hasConversation()} fallback={<AiEmptyState {...props} />}>
          <For each={props.store.messages()}>
            {(msg) => (
              <AiMessage role={msg.role} content={msg.content} tools={msg.tools} />
            )}
          </For>
          <Show when={props.store.streaming()}>
            <AiMessage
              role="assistant"
              content={props.store.streamingText()}
              tools={props.store.toolActivity()}
              streaming
            />
          </Show>
        </Show>
        <Show when={props.store.error()}>
          {(err) => (
            <div class="ai-error" role="alert">
              {err().message || (useLocale(), m.ai_error_generic())}
            </div>
          )}
        </Show>
      </div>

      <div class="ai-composer">
        <textarea
          ref={(el) => (textarea = el)}
          class="ai-composer-input"
          rows={2}
          placeholder={(useLocale(), m.ai_composer_placeholder())}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <div class="ai-composer-actions">
          <Show
            when={props.store.streaming()}
            fallback={
              <Button
                size="sm"
                onClick={submit}
                disabled={!input().trim()}
                aria-label={(useLocale(), m.ai_composer_send())}
              >
                {(useLocale(), m.ai_composer_send())}
              </Button>
            }
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.store.cancel()}
            >
              {(useLocale(), m.ai_composer_stop())}
            </Button>
          </Show>
        </div>
      </div>
    </div>
  );
}

function AiEmptyState(props: AiPanelProps): JSX.Element {
  return (
    <div class="ai-empty">
      <IconSparkles width={28} height={28} class="ai-empty-icon" />
      <Show
        when={props.store.providerReady()}
        fallback={
          <>
            <p class="ai-empty-title">
              {(useLocale(), m.ai_empty_no_provider_title())}
            </p>
            <p class="ai-empty-body">
              {(useLocale(), m.ai_empty_no_provider_body())}
            </p>
            <Show when={props.onOpenSettings}>
              <Button size="sm" variant="outline" onClick={() => props.onOpenSettings?.()}>
                {(useLocale(), m.ai_empty_no_provider_cta())}
              </Button>
            </Show>
          </>
        }
      >
        <p class="ai-empty-title">{(useLocale(), m.ai_empty_title())}</p>
        <p class="ai-empty-body">{(useLocale(), m.ai_empty_body())}</p>
      </Show>
    </div>
  );
}
