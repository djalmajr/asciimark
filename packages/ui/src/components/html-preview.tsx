import { createEffect, createSignal, onCleanup, type JSX } from "solid-js";

export interface HtmlPreviewProps {
  /** The HTML source (the live editor content). */
  content: string;
  /** asset:// URL of the file's directory (with trailing slash) so relative
   *  resources (CSS / images / links) resolve. Omitted → relative paths break. */
  baseHref?: string;
}

/** Inject a `<base href>` so relative resources resolve against the file's
 *  directory — after an existing `<head>` when present, else prepended. */
function withBase(html: string, baseHref?: string): string {
  if (!baseHref) return html;
  const tag = `<base href="${baseHref.replace(/"/g, "&quot;")}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${html}`;
}

/**
 * Live, SANDBOXED preview of an HTML file. The source is rendered in an
 * `<iframe srcdoc>` with `sandbox="allow-scripts"` (no `allow-same-origin`), so
 * the page runs in an isolated opaque origin: its own scripts/styles render with
 * full fidelity, but it CANNOT reach the host app, its DOM, or the Tauri IPC.
 * A `<base href="asset://…">` lets relative resources load. The content is
 * debounced so typing doesn't reload the frame on every keystroke.
 */
export function HtmlPreview(props: HtmlPreviewProps): JSX.Element {
  const [doc, setDoc] = createSignal(withBase(props.content, props.baseHref));
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const next = withBase(props.content, props.baseHref);
    clearTimeout(timer);
    timer = setTimeout(() => setDoc(next), 350);
  });
  onCleanup(() => clearTimeout(timer));

  return (
    <iframe
      class="html-preview-frame"
      title="HTML preview"
      sandbox="allow-scripts allow-popups allow-forms allow-modals"
      srcdoc={doc()}
    />
  );
}
