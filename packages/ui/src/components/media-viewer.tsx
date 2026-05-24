import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import * as m from "@asciimark/i18n";
import { useLocale } from "@asciimark/i18n/solid";
import IconScan from "~icons/lucide/scan";
import IconZoomIn from "~icons/lucide/zoom-in";
import IconZoomOut from "~icons/lucide/zoom-out";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

// Worker asset URL. Vite emits the worker as a standalone file and hands
// back a URL it can resolve under Tauri's asset/file protocol and in the
// web builds. This is only a string — the heavy pdfjs runtime stays out
// of the initial bundle and is pulled in lazily on the first PDF open.
import PdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const SCALE_STEP = 0.25;

export interface MediaViewerProps {
  kind: "image" | "pdf";
  /** Asset URL the webview can load, already resolved by the host
   *  (desktop via `convertFileSrc`). Null when the host can't resolve it. */
  src: string | null;
  fileName: string;
}

function clampScale(n: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

/**
 * Builtin viewer for binary files the editor/preview pipeline can't handle.
 * Images render straight into an `<img>` off the asset URL; PDFs are drawn
 * with pdf.js (bundled so rendering is identical across macOS/Windows/Linux,
 * where the webview's native PDF support is inconsistent) as a single
 * continuously-scrollable column of pages. No Tauri imports here — the host
 * injects the resolved `src`, keeping this component usable from the
 * web/extension builds too.
 */
export function MediaViewer(props: MediaViewerProps) {
  const [scale, setScale] = createSignal(1);
  // Image-only: fit-to-container mode (CSS object-fit). Zooming exits it.
  const [fit, setFit] = createSignal(true);
  const [naturalWidth, setNaturalWidth] = createSignal(0);
  const [imageError, setImageError] = createSignal(false);

  const [pageCount, setPageCount] = createSignal(0);
  const [pdfError, setPdfError] = createSignal<string | null>(null);
  const [pdfLoading, setPdfLoading] = createSignal(false);

  let pdfDoc: PDFDocumentProxy | null = null;
  let basePageWidth = 0;
  let stageRef: HTMLDivElement | undefined;
  const canvasRefs: (HTMLCanvasElement | undefined)[] = [];
  let renderGen = 0;
  let renderTasks: RenderTask[] = [];

  function cancelRenders() {
    for (const t of renderTasks) {
      try {
        t.cancel();
      } catch {
        // already settled
      }
    }
    renderTasks = [];
  }

  // Scale that makes a page fill the stage width (minus padding). Falls back
  // to 1 before the stage is measured or the doc's base width is known.
  function computeFitScale(): number {
    if (stageRef && basePageWidth) {
      const avail = stageRef.clientWidth - 32;
      if (avail > 0) return clampScale(avail / basePageWidth);
    }
    return 1;
  }

  // Load (or tear down) the PDF whenever the source or kind changes —
  // covers reusing the same pane for a different file.
  createEffect(
    on(
      () => [props.kind, props.src] as const,
      async ([kind, src]) => {
        cancelRenders();
        if (pdfDoc) {
          void pdfDoc.destroy();
          pdfDoc = null;
        }
        setScale(1);
        setFit(props.kind === "image");
        setImageError(false);
        setPdfError(null);
        setPageCount(0);
        canvasRefs.length = 0;
        if (kind !== "pdf" || !src) return;

        setPdfLoading(true);
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;
          const doc = await pdfjs.getDocument(src).promise;
          // A newer load may have superseded this one mid-await.
          if (src !== props.src) {
            void doc.destroy();
            return;
          }
          pdfDoc = doc;
          const first = await doc.getPage(1);
          basePageWidth = first.getViewport({ scale: 1 }).width;
          setScale(computeFitScale());
          // Mounting the canvases (via pageCount) drives the render effect.
          setPageCount(doc.numPages);
        } catch (e) {
          // Surfaces genuinely broken/mislabeled files (e.g. a .pdf that is
          // actually text → pdf.js throws InvalidPDFException) without a
          // silent blank canvas.
          console.error("[MediaViewer] failed to load PDF:", (e as Error)?.message ?? e);
          setPdfError((e as Error)?.message ?? String(e));
        } finally {
          setPdfLoading(false);
        }
      },
    ),
  );

  // Render every page into its canvas on load and on zoom change. Pages are
  // drawn sequentially; a generation counter + task cancellation bail out
  // when a newer render (zoom or file switch) supersedes this pass.
  createEffect(
    on(
      () => [pageCount(), scale()] as const,
      async ([count]) => {
        if (props.kind !== "pdf" || !pdfDoc || count === 0) return;
        const gen = ++renderGen;
        cancelRenders();
        // Let the <For> mount its canvases before we reach for the refs.
        await Promise.resolve();
        for (let i = 1; i <= count; i++) {
          if (gen !== renderGen) return;
          const canvas = canvasRefs[i - 1];
          if (!canvas) continue;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          try {
            const page = await pdfDoc.getPage(i);
            if (gen !== renderGen) return;
            const viewport = page.getViewport({ scale: scale() });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const task = page.render({ canvasContext: ctx, viewport, canvas });
            renderTasks.push(task);
            await task.promise;
          } catch {
            // RenderingCancelledException fires on superseded renders — benign.
          }
        }
      },
    ),
  );

  onCleanup(() => {
    cancelRenders();
    if (pdfDoc) void pdfDoc.destroy();
  });

  function zoomIn() {
    setFit(false);
    setScale((s) => clampScale(s + SCALE_STEP));
  }
  function zoomOut() {
    setFit(false);
    setScale((s) => clampScale(s - SCALE_STEP));
  }
  function fitView() {
    if (props.kind === "image") {
      setFit(true);
      return;
    }
    setScale(computeFitScale());
  }

  const zoomLabel = () =>
    fit() && props.kind === "image" ? m.media_fit_label() : `${Math.round(scale() * 100)}%`;

  const imageStyle = () => {
    if (fit()) return undefined;
    const w = naturalWidth();
    return w
      ? { width: `${Math.round(w * scale())}px` }
      : { transform: `scale(${scale()})` };
  };

  return (
    <div class="media-viewer">
      <div class="media-toolbar no-print">
        <span class="media-filename" title={props.fileName}>{props.fileName}</span>
        <Show when={props.kind === "pdf" && pageCount() > 0}>
          <span class="media-page-value">
            {pageCount()} {(useLocale(), pageCount() === 1 ? m.media_page() : m.media_pages())}
          </span>
        </Show>
        <div class="media-toolbar-spacer" />
        <Tooltip>
          <TooltipTrigger
            as="button"
            class="content-toolbar-btn"
            aria-label={(useLocale(), m.media_zoom_out())}
            disabled={!fit() && scale() <= MIN_SCALE}
            onClick={zoomOut}
          >
            <IconZoomOut width={14} height={14} />
          </TooltipTrigger>
          <TooltipContent>{(useLocale(), m.media_zoom_out())}</TooltipContent>
        </Tooltip>
        <span class="media-zoom-value">{(useLocale(), zoomLabel())}</span>
        <Tooltip>
          <TooltipTrigger
            as="button"
            class="content-toolbar-btn"
            aria-label={(useLocale(), m.media_zoom_in())}
            disabled={!fit() && scale() >= MAX_SCALE}
            onClick={zoomIn}
          >
            <IconZoomIn width={14} height={14} />
          </TooltipTrigger>
          <TooltipContent>{(useLocale(), m.media_zoom_in())}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            as="button"
            class="content-toolbar-btn"
            aria-label={(useLocale(), props.kind === "pdf" ? m.media_fit_width() : m.media_fit_window())}
            onClick={fitView}
          >
            <IconScan width={14} height={14} />
          </TooltipTrigger>
          <TooltipContent>{(useLocale(), props.kind === "pdf" ? m.media_fit_width() : m.media_fit_window())}</TooltipContent>
        </Tooltip>
      </div>

      <div
        class="media-stage"
        classList={{ "media-stage-image": props.kind === "image" }}
        ref={stageRef}
      >
        <Show
          when={props.src}
          fallback={<div class="media-message">{(useLocale(), m.media_unable_to_load({ name: props.fileName }))}</div>}
        >
          <Show when={props.kind === "image"}>
            <Show
              when={!imageError()}
              fallback={<div class="media-message">{(useLocale(), m.media_unable_to_display({ name: props.fileName }))}</div>}
            >
              <img
                class="media-image"
                classList={{ "media-image-fit": fit() }}
                src={props.src!}
                alt={props.fileName}
                style={imageStyle()}
                onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
                onError={() => setImageError(true)}
              />
            </Show>
          </Show>

          <Show when={props.kind === "pdf"}>
            <Show
              when={!pdfError()}
              fallback={<div class="media-message">{(useLocale(), m.media_unable_to_display({ name: props.fileName }))}</div>}
            >
              <Show when={pdfLoading() && pageCount() === 0}>
                <div class="media-message">{(useLocale(), m.media_loading())}</div>
              </Show>
              <div class="media-pdf-doc">
                <For each={Array.from({ length: pageCount() }, (_, i) => i)}>
                  {(i) => (
                    <canvas
                      class="media-pdf-page"
                      ref={(el) => (canvasRefs[i] = el)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
