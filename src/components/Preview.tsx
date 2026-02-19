import { Show, createEffect, onMount, onCleanup } from "solid-js";
import mermaid from "mermaid";
import "../styles/asciidoc.css";

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "inherit",
  });
  mermaidInitialized = true;
}

async function renderMermaidBlocks(container: HTMLElement) {
  const blocks = container.querySelectorAll<HTMLElement>("div.mermaid");
  if (blocks.length === 0) return;

  initMermaid();

  let idx = 0;
  for (const block of blocks) {
    if (block.getAttribute("data-processed")) continue;

    const source = block.textContent?.trim() ?? "";
    if (!source) continue;

    try {
      const id = `mermaid-${Date.now()}-${idx++}`;
      const { svg } = await mermaid.render(id, source);
      block.innerHTML = svg;
      block.setAttribute("data-processed", "true");
    } catch (e) {
      console.warn("Mermaid render error:", e);
      block.innerHTML = `<pre class="mermaid-error">Mermaid error: ${e}\n\n${source}</pre>`;
    }

    // Clean up temporary render containers mermaid leaves in the body
    document.querySelectorAll('div[id^="dmermaid-"]').forEach((el) => el.remove());
  }
}

/** Set up IntersectionObserver to highlight the current TOC link based on scroll position */
function setupTocScrollTracking(container: HTMLElement): (() => void) | undefined {
  const toc = container.querySelector("#toc");
  if (!toc) return;

  const tocLinks = Array.from(toc.querySelectorAll<HTMLAnchorElement>("a[href^='#']"));
  if (tocLinks.length === 0) return;

  const headingIds = tocLinks.map((a) => a.getAttribute("href")!.slice(1));
  const headings = headingIds
    .map((id) => container.querySelector(`[id="${id}"]`))
    .filter(Boolean) as HTMLElement[];

  if (headings.length === 0) return;

  let currentActive: HTMLAnchorElement | null = null;

  function setActive(id: string) {
    if (currentActive) currentActive.classList.remove("toc-active");
    const link = toc!.querySelector<HTMLAnchorElement>(`a[href="#${id}"]`);
    if (link) {
      link.classList.add("toc-active");
      currentActive = link;
      // Auto-scroll TOC so active item is visible
      link.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  const visibleHeadings = new Map<string, IntersectionObserverEntry>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id;
        if (entry.isIntersecting) {
          visibleHeadings.set(id, entry);
        } else {
          visibleHeadings.delete(id);
        }
      }

      let topId: string | null = null;
      let topY = Infinity;
      for (const [id, entry] of visibleHeadings) {
        if (entry.boundingClientRect.top < topY) {
          topY = entry.boundingClientRect.top;
          topId = id;
        }
      }

      if (topId) {
        setActive(topId);
      }
    },
    {
      rootMargin: "-53px 0px -60% 0px",
      threshold: 0,
    }
  );

  for (const heading of headings) {
    observer.observe(heading);
  }

  if (headings.length > 0) {
    setActive(headings[0].id);
  }

  return () => observer.disconnect();
}

/** ADOC file extensions to detect navigable links */
const ADOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc", ".ad"];

function isAdocHref(href: string): boolean {
  const path = href.split("#")[0]!;
  return ADOC_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Resolve a relative link target against the current file's directory.
 */
function resolveRelativePath(currentFilePath: string, target: string): string {
  const dirParts = currentFilePath.includes("/")
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf("/")).split("/")
    : [];

  const targetParts = target.split("/");

  for (const part of targetParts) {
    if (part === "..") {
      dirParts.pop();
    } else if (part !== "." && part !== "") {
      dirParts.push(part);
    }
  }

  return dirParts.join("/");
}

interface PreviewProps {
  html: string;
  loading: boolean;
  tocVisible: boolean;
  /** Current file path (relative to root), used to resolve xref links */
  currentFilePath: string | null;
  /** Called when user clicks an .adoc link; receives the resolved path */
  onNavigate: (path: string) => void;
}

export function Preview(props: PreviewProps) {
  let articleRef: HTMLElement | undefined;
  let cleanupToc: (() => void) | undefined;

  // Listen for theme changes to re-init mermaid
  onMount(() => {
    const observer = new MutationObserver(() => {
      mermaidInitialized = false;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    onCleanup(() => observer.disconnect());
  });

  onCleanup(() => cleanupToc?.());

  /**
   * Intercept clicks on links inside the rendered AsciiDoc:
   * - #anchor links: scroll manually within .content container (prevent hash corruption)
   * - .adoc file links: navigate via SPA routing
   */
  function handleClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Handle #anchor links (TOC items, section links)
    if (href.startsWith("#")) {
      e.preventDefault();
      const targetId = decodeURIComponent(href.slice(1));
      if (!targetId) return;

      // Find the target element and scroll it into view within the .content container
      const target = articleRef?.querySelector(`[id="${CSS.escape(targetId)}"]`) as HTMLElement | null;
      if (target) {
        const contentEl = articleRef?.closest(".content");
        if (contentEl) {
          // Calculate offset within the scrollable container
          const targetRect = target.getBoundingClientRect();
          const contentRect = contentEl.getBoundingClientRect();
          const offset = targetRect.top - contentRect.top + contentEl.scrollTop - 16;
          contentEl.scrollTo({ top: offset, behavior: "smooth" });
        } else {
          target.scrollIntoView({ behavior: "smooth" });
        }
      }
      return;
    }

    // Skip external links (http/https/mailto)
    if (/^[a-z]+:\/\//i.test(href) || href.startsWith("mailto:")) return;

    // Check if it's an .adoc file link
    if (!isAdocHref(href)) return;

    e.preventDefault();
    e.stopPropagation();

    // Resolve relative to current file
    const currentPath = props.currentFilePath;
    const targetPath = currentPath ? resolveRelativePath(currentPath, href) : href;

    props.onNavigate(targetPath);
  }

  // Render mermaid blocks, set up TOC tracking, and apply TOC visibility whenever html changes
  createEffect(() => {
    const _html = props.html;
    // Also track tocVisible so this re-runs when it changes
    const tocVis = props.tocVisible;

    if (articleRef && _html) {
      queueMicrotask(() => {
        renderMermaidBlocks(articleRef!);

        // Apply TOC visibility
        const toc = articleRef!.querySelector<HTMLElement>("#toc");
        if (toc) {
          toc.style.display = tocVis ? "" : "none";
        }

        // Set up scroll tracking (only if TOC is visible)
        cleanupToc?.();
        if (tocVis) {
          cleanupToc = setupTocScrollTracking(articleRef!);
        } else {
          cleanupToc = undefined;
        }
      });
    }
  });

  return (
    <div class="preview">
      <Show when={props.loading}>
        <div class="preview-loading">Converting...</div>
      </Show>
      <article
        ref={articleRef}
        class="adoc-body"
        innerHTML={props.html}
        onClick={handleClick}
      />
    </div>
  );
}
