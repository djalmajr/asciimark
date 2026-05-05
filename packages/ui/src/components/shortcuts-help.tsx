import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import {
  SHORTCUTS,
  detectPlatform,
  groupShortcuts,
  shortcutKeys,
  type Platform,
  type ShortcutDescriptor,
  type ShortcutGroup,
} from "@asciimark/core/keyboard-shortcuts.ts";

export interface ShortcutsHelpProps {
  open: boolean;
  /** Override the auto-detected platform. Test-only; production callers
   *  rely on the `navigator.platform` lookup performed inside the modal. */
  platform?: Platform;
  onClose: () => void;
}

const GROUP_ORDER: ShortcutGroup[] = ["File", "Tabs", "Navigation", "Help"];

export function ShortcutsHelp(props: ShortcutsHelpProps) {
  const platform = createMemo<Platform>(() => {
    if (props.platform) return props.platform;
    return detectPlatform(typeof navigator === "undefined" ? "" : navigator.platform);
  });

  const grouped = createMemo(() => groupShortcuts(SHORTCUTS));

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) props.onClose();
  }

  // Esc closes from anywhere — input focus is irrelevant here, the modal
  // has no input. Capture phase so the editor / file tree don't swallow it.
  onMount(() => {
    function global(event: KeyboardEvent) {
      if (props.open && event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    }
    document.addEventListener("keydown", global, true);
    onCleanup(() => document.removeEventListener("keydown", global, true));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="shortcuts-help-backdrop" onMouseDown={handleBackdropClick}>
          <div
            class="shortcuts-help-panel"
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div class="shortcuts-help-header">
              <h2 class="shortcuts-help-title">Keyboard shortcuts</h2>
              <span class="shortcuts-help-platform">
                {platform() === "mac" ? "macOS" : "Windows / Linux"}
              </span>
            </div>
            <div class="shortcuts-help-body">
              <For each={GROUP_ORDER}>
                {(groupName) => (
                  <Show when={(grouped().get(groupName)?.length ?? 0) > 0}>
                    <section class="shortcuts-help-group">
                      <h3 class="shortcuts-help-group-title">{groupName}</h3>
                      <ul class="shortcuts-help-list">
                        <For each={grouped().get(groupName) ?? []}>
                          {(shortcut) => <Row shortcut={shortcut} platform={platform()} />}
                        </For>
                      </ul>
                    </section>
                  </Show>
                )}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

function Row(props: { shortcut: ShortcutDescriptor; platform: Platform }) {
  return (
    <li class="shortcuts-help-row">
      <span class="shortcuts-help-desc">{props.shortcut.description}</span>
      <span class="shortcuts-help-keys">
        <For each={shortcutKeys(props.shortcut, props.platform)}>
          {(token, index) => (
            <>
              <Show when={index() > 0}>
                <span class="shortcuts-help-key-sep">+</span>
              </Show>
              <kbd class="shortcuts-help-key">{token}</kbd>
            </>
          )}
        </For>
      </span>
    </li>
  );
}
