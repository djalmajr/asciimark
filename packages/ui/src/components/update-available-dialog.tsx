import { Show, createMemo } from "solid-js";
import MarkdownIt from "markdown-it";
import * as m from "@asciimark/i18n";
import { useLocale } from "@asciimark/i18n/solid";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";

// Minimal renderer for release-notes content. `html: false` disables
// raw HTML embedded in the markdown (release notes come from GitHub
// commit messages — no reason to allow inline HTML, and disabling it
// lets us inject the rendered output without sanitizing). Link
// autodetection (`linkify`) is off because Tauri's webview opens
// links in the embedded view, not the system browser, and the modal
// is short-lived.
const md = new MarkdownIt({ html: false, breaks: true, linkify: false });

export interface UpdateAvailableDialogProps {
  open: boolean;
  /** New version string (e.g. "0.9.0"). */
  version: string;
  /** Currently installed version. */
  currentVersion: string;
  /** Optional release-notes body — typically markdown / plain text from
   *  the GitHub release. Rendered as preformatted text (no parsing) so
   *  long changelogs don't introduce surprises. */
  notes?: string;
  /** Triggered when the user accepts the install. */
  onInstall: () => void;
  /** Triggered when the user defers (Esc, Later, click outside). */
  onDismiss: () => void;
}

/**
 * Custom update-available modal that replaces the native Tauri `ask()`
 * dialog. The native dialog can't scroll its body, so a long changelog
 * pushes the action buttons off-screen — we hit that on a release with
 * 30+ commits in the notes.
 *
 * Layout: fixed header (title + version line) + scrollable body
 * (release notes) + sticky footer (Later / Install). The body grows
 * until ~60vh, then scrolls. Buttons are always visible.
 */
export function UpdateAvailableDialog(props: UpdateAvailableDialogProps) {
  const renderedNotes = createMemo(() => {
    const notes = props.notes?.trim();
    return notes ? md.render(notes) : "";
  });

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onDismiss();
      }}
    >
      <AlertDialogContent class="flex max-h-[80vh] w-full max-w-xl flex-col gap-0 overflow-hidden p-0">
        <header class="flex flex-col gap-1 border-b border-border px-6 py-4">
          <AlertDialogTitle class="text-lg font-semibold">
            {(useLocale(), m.update_available_title())}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            {(useLocale(),
              m.update_available_subtitle({
                version: props.version,
                current: props.currentVersion,
              }))}
          </AlertDialogDescription>
        </header>

        <div class="flex-1 overflow-y-auto px-6 py-4">
          <Show
            when={props.notes && props.notes.trim().length > 0}
            fallback={
              <p class="text-sm text-muted-foreground">
                {(useLocale(), m.update_available_no_notes())}
              </p>
            }
          >
            {/*
             * `innerHTML` is safe here because `md.render` runs with
             * `html: false`, so any tags inside the source markdown
             * are escaped to literal text rather than emitted as DOM.
             */}
            <div
              class="release-notes-body text-sm leading-relaxed text-foreground"
              innerHTML={renderedNotes()}
            />
          </Show>
        </div>

        <footer class="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={props.onDismiss}>
            {(useLocale(), m.update_available_later())}
          </Button>
          <Button onClick={props.onInstall}>
            {(useLocale(), m.update_available_install())}
          </Button>
        </footer>
      </AlertDialogContent>
    </AlertDialog>
  );
}
