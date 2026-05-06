import IconX from "~icons/lucide/x";
import * as m from "@asciimark/i18n";
import { useLocale } from "@asciimark/i18n/solid";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";

export interface AboutDialogProps {
  open: boolean;
  /** Application semantic version, e.g. "0.9.0". */
  version: string;
  /** Optional commit short SHA injected at build time. */
  commit?: string;
  onClose: () => void;
}

/**
 * "About AsciiMark" modal — version, links, license. Triggered by the
 * Command Palette's `Help: About AsciiMark` entry and the
 * "About AsciiMark" menu item. Mirrors the layout of
 * `<UpdateAvailableDialog>` so the two dialogs feel consistent.
 */
export function AboutDialog(props: AboutDialogProps) {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      {/*
       * No `relative` here — `AlertDialogContent` ships `position: fixed`
       * for the centered placement; adding `relative` would override it
       * and the modal would render at document-flow position. The X
       * button uses `absolute`, which still anchors to the fixed
       * dialog because there is no other positioned ancestor inside.
       */}
      <AlertDialogContent class="flex max-h-[80vh] w-full max-w-md flex-col gap-0 overflow-hidden p-6">
        <button
          aria-label={(useLocale(), m.about_close())}
          class="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          type="button"
          onClick={props.onClose}
        >
          <IconX width={16} height={16} />
        </button>

        <div class="flex flex-col items-center gap-3 pb-2">
          <img
            alt="AsciiMark"
            class="h-12 w-12"
            src="/asciimark-logo.svg"
            onError={(e) => {
              // Logo asset isn't shipped with the desktop bundle today;
              // hide the broken-image icon if so.
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <AlertDialogTitle class="text-lg font-semibold">
            AsciiMark
          </AlertDialogTitle>
          <AlertDialogDescription class="text-center text-sm text-muted-foreground">
            {(useLocale(), m.about_tagline())}
          </AlertDialogDescription>
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{(useLocale(), m.about_version_label())}</span>
            <code class="rounded bg-secondary px-2 py-0.5 font-mono text-xs">
              {props.version}
            </code>
          </div>
          {props.commit && (
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{(useLocale(), m.about_commit_label())}</span>
              <code class="rounded bg-secondary px-2 py-0.5 font-mono text-xs">
                {props.commit}
              </code>
            </div>
          )}
        </div>

        <div class="mt-4 flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
          <a
            class="text-primary underline-offset-2 hover:underline"
            href="https://asciimark.djalmajr.dev/"
            rel="noreferrer"
            target="_blank"
          >
            {(useLocale(), m.about_website())}
          </a>
          <a
            class="text-primary underline-offset-2 hover:underline"
            href="https://github.com/djalmajr/asciimark-releases/releases"
            rel="noreferrer"
            target="_blank"
          >
            {(useLocale(), m.about_releases())}
          </a>
          <a
            class="text-primary underline-offset-2 hover:underline"
            href="https://github.com/djalmajr/asciimark-releases/issues"
            rel="noreferrer"
            target="_blank"
          >
            {(useLocale(), m.about_report_issue())}
          </a>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
