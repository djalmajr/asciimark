// Pure decision function for the desktop window's `onCloseRequested`
// event. Extracted from the Tauri callback so the contract can be
// exercised in unit tests — the Tauri runtime would otherwise be
// untestable from bun without a full app shell.

import type { CloseBehavior } from "@asciimark/core/window-prefs.ts";

type CloseAction = "hide" | "let-close";

/**
 * Decide what to do when the OS asks the window to close.
 *
 * `isUpdating` always wins: once the Tauri updater is mid-install
 * the window MUST be allowed to close so the relaunched binary can
 * take over. The user's `closeBehavior` preference is consulted
 * only outside that window. Default semantics:
 *
 * - `"tray"` (the default, preserves pre-DJA-50 behaviour) →
 *   prevent the close and hide the window into the system tray.
 * - `"quit"` → let the close proceed normally, which on every
 *   platform Tauri supports means the process exits.
 */
function decideCloseAction(args: {
  closeBehavior: CloseBehavior;
  isUpdating: boolean;
}): CloseAction {
  if (args.isUpdating) return "let-close";
  if (args.closeBehavior === "quit") return "let-close";
  return "hide";
}

export type { CloseAction };
export { decideCloseAction };
