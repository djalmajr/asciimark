import { For, Show, createSignal, onMount } from "solid-js";
import { Button } from "@asciimark/ui/components/ui/button.tsx";
import { Link } from "@tanstack/solid-router";

interface FeatureItem {
  description: string;
  title: string;
}

interface DownloadItem {
  asset: string;
  helper: string;
  platform: string;
}

interface ScreenshotItem {
  alt: string;
  caption: string;
  path: string;
}

const RELEASES_BASE_URL =
  "https://github.com/djalmajr/asciimark-releases/releases/latest/download";
const RELEASES_LATEST_URL =
  "https://github.com/djalmajr/asciimark-releases/releases/latest";

interface PreferredDownload {
  href: string;
  label: string;
}

const featureItems: FeatureItem[] = [
  {
    title: "AsciiDoc + Markdown",
    description:
      "Renders both formats with admonitions, includes, frontmatter, and reusable partials in a single viewer.",
  },
  {
    title: "Split panes",
    description:
      "Open two files side by side. Drag tabs across panes, persist layout between sessions, focus with Cmd/Ctrl+1/2.",
  },
  {
    title: "Quick navigation",
    description:
      "Cmd/Ctrl+P to open a file, Cmd/Ctrl+Shift+P for the command palette, Cmd/Ctrl+Shift+O to jump to a heading, Cmd/Ctrl+Shift+F to search across the workspace.",
  },
  {
    title: "Multi-root workspaces",
    description:
      "Drop several folders into the sidebar and reorder them — useful when reading docs spread across repos.",
  },
  {
    title: "Diagrams and math",
    description:
      "Mermaid, PlantUML, Graphviz via Kroki, plus KaTeX for inline and display math. Renders inside the preview, no extra setup.",
  },
  {
    title: "Edit + Live preview",
    description:
      "CodeMirror editor with sync scroll, find-in-file, configurable indent and line numbers — all wired to the live preview pane.",
  },
  {
    title: "Themes and typography",
    description:
      "Light, dark, and system themes. Pick from a curated set of editor and preview fonts and adjust size on the fly.",
  },
  {
    title: "Export to PDF",
    description:
      "Print-ready PDF export from the preview, with the same fonts and theme you see on screen.",
  },
  {
    title: "Local-first",
    description:
      "Files never leave your machine. The desktop app and extension both read directly from the filesystem.",
  },
  {
    title: "Auto-update",
    description:
      "Tauri's updater pulls signed releases from GitHub on startup. Skip the App Store, install once, stay current.",
  },
  {
    title: "Desktop + Extension",
    description:
      "Run as a Tauri desktop app on macOS, Linux, and Windows — or install the Chrome extension to preview .adoc/.md files inline.",
  },
  {
    title: "Keyboard-first",
    description:
      "Every action exposed via the command palette and discoverable from the welcome screen's shortcuts hint.",
  },
];

const downloadItems: DownloadItem[] = [
  {
    platform: "macOS (Apple Silicon)",
    helper: "DMG installer",
    asset: "AsciiMark-macos-arm64.dmg",
  },
  {
    platform: "macOS (Intel)",
    helper: "DMG installer",
    asset: "AsciiMark-macos-x64.dmg",
  },
  {
    platform: "Linux",
    helper: "AppImage",
    asset: "AsciiMark-linux-x64.AppImage",
  },
  {
    platform: "Linux (Debian)",
    helper: "DEB package",
    asset: "AsciiMark-linux-x64.deb",
  },
  {
    platform: "Windows",
    helper: "MSI installer",
    asset: "AsciiMark-windows-x64.msi",
  },
  {
    platform: "Windows (alt)",
    helper: "EXE installer",
    asset: "AsciiMark-windows-x64.exe",
  },
];

const screenshotItems: ScreenshotItem[] = [
  {
    path: "/screenshots/desktop-welcome.png",
    alt: "AsciiMark welcome screen with drop zone and keyboard shortcuts hint",
    caption: "Welcome screen — drop a folder or click to open",
  },
  {
    path: "/screenshots/desktop-workspace-preview.png",
    alt: "AsciiMark with a Markdown file rendered alongside the file tree and TOC",
    caption: "Live preview with sidebar tree and table of contents",
  },
  {
    path: "/screenshots/desktop-split-panes.png",
    alt: "Two files open in split panes side by side",
    caption: "Split panes — read two files at the same time",
  },
  {
    path: "/screenshots/desktop-edit-preview.png",
    alt: "Editor and preview panes side by side with sync scroll",
    caption: "Edit + Preview — write and see the rendered output instantly",
  },
  {
    path: "/screenshots/desktop-quick-open.png",
    alt: "Cmd/Ctrl+P fuzzy file picker showing matched files",
    caption: "Quick Open (Cmd/Ctrl+P) — fuzzy-find any file",
  },
  {
    path: "/screenshots/desktop-command-palette.png",
    alt: "Cmd/Ctrl+Shift+P command palette listing actions",
    caption: "Command Palette (Cmd/Ctrl+Shift+P) — every action in one place",
  },
  {
    path: "/screenshots/desktop-symbol-palette.png",
    alt: "Cmd/Ctrl+Shift+O heading navigator showing the document outline",
    caption: "Go to Heading (Cmd/Ctrl+Shift+O) — jump anywhere in the document",
  },
  {
    path: "/screenshots/desktop-find-in-files.png",
    alt: "Cmd/Ctrl+Shift+F search across the workspace with grouped results",
    caption: "Find in Files (Cmd/Ctrl+Shift+F) — search across the workspace",
  },
  {
    path: "/screenshots/desktop-shortcuts-help.png",
    alt: "Keyboard shortcuts modal listing every binding",
    caption: "Shortcuts Help (Cmd/Ctrl+/) — discover bindings as you go",
  },
  {
    path: "/screenshots/desktop-dark-theme.png",
    alt: "AsciiMark in dark theme showing a rendered Markdown document",
    caption: "Dark theme — easy on the eyes for late-night reading",
  },
];

const heroPreviewItem: ScreenshotItem = {
  path: "/screenshots/desktop-workspace-preview.png",
  alt: "AsciiMark desktop app with Markdown file, sidebar tree, and table of contents",
  caption: "Desktop preview with sidebar, tabs, and table of contents.",
};

function releaseUrl(asset: string) {
  return `${RELEASES_BASE_URL}/${asset}`;
}

function detectPreferredDownload(): PreferredDownload {
  if (typeof navigator === "undefined") {
    return { href: RELEASES_LATEST_URL, label: "your platform" };
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const maybeUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    maybeUserAgentData.userAgentData?.platform?.toLowerCase() ??
    navigator.platform.toLowerCase();

  if (platform.includes("mac")) {
    const hasSiliconHint =
      platform.includes("arm") ||
      userAgent.includes("arm64") ||
      userAgent.includes("aarch64") ||
      userAgent.includes("apple silicon");
    const hasIntelHint = userAgent.includes("intel") || userAgent.includes("x86_64");
    const isAppleSilicon = hasSiliconHint || !hasIntelHint;
    return {
      href: releaseUrl(isAppleSilicon ? "AsciiMark-macos-arm64.dmg" : "AsciiMark-macos-x64.dmg"),
      label: isAppleSilicon ? "macOS (Apple Silicon)" : "macOS (Intel)",
    };
  }

  if (platform.includes("win")) {
    return {
      href: releaseUrl("AsciiMark-windows-x64.msi"),
      label: "Windows",
    };
  }

  if (platform.includes("linux")) {
    return {
      href: releaseUrl("AsciiMark-linux-x64.AppImage"),
      label: "Linux",
    };
  }

  return { href: RELEASES_LATEST_URL, label: "your platform" };
}

async function refineMacDownloadWithUserAgentData(
  fallback: PreferredDownload,
): Promise<PreferredDownload> {
  if (typeof navigator === "undefined") {
    return fallback;
  }

  const maybeUserAgentData = navigator as Navigator & {
    userAgentData?: {
      getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
      platform?: string;
    };
  };
  const platform =
    maybeUserAgentData.userAgentData?.platform?.toLowerCase() ??
    navigator.platform.toLowerCase();

  if (!platform.includes("mac")) {
    return fallback;
  }

  try {
    const values = await maybeUserAgentData.userAgentData?.getHighEntropyValues?.([
      "architecture",
    ]);
    const architecture = values?.architecture?.toLowerCase();

    if (architecture?.includes("arm")) {
      return {
        href: releaseUrl("AsciiMark-macos-arm64.dmg"),
        label: "macOS (Apple Silicon)",
      };
    }

    if (architecture?.includes("x86")) {
      return {
        href: releaseUrl("AsciiMark-macos-x64.dmg"),
        label: "macOS (Intel)",
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function HomePage() {
  const [activeScreenshot, setActiveScreenshot] = createSignal<ScreenshotItem | null>(null);
  const [preferredDownload, setPreferredDownload] = createSignal<PreferredDownload>(
    detectPreferredDownload(),
  );

  onMount(() => {
    void refineMacDownloadWithUserAgentData(preferredDownload()).then((refined) => {
      setPreferredDownload(refined);
    });
  });

  function closeScreenshotModal() {
    setActiveScreenshot(null);
  }

  function openScreenshotModal(item: ScreenshotItem) {
    setActiveScreenshot(item);
  }

  return (
    <div class="page-stack">
      <section class="hero-panel">
        <div class="hero-layout">
          <div>
            <p class="hero-kicker">AsciiDoc and Markdown Viewer</p>
            <h1 class="hero-title">Ship docs faster with a local-first preview workflow.</h1>
            <p class="hero-description">
              AsciiMark keeps authoring and preview side by side across desktop and browser.
              Install the latest build from GitHub Releases and keep everything in one ecosystem.
            </p>
            <div class="hero-actions">
              <Button as="a" href={preferredDownload().href} rel="noreferrer" target="_blank">
                Download for {preferredDownload().label}
              </Button>
              <Button as={Link} to="/guide" variant="secondary">
                Read Guide
              </Button>
            </div>
          </div>
          <figure class="hero-shot">
            <button
              class="hero-shot-button"
              onClick={() => openScreenshotModal(heroPreviewItem)}
              type="button"
            >
              <img alt={heroPreviewItem.alt} src={heroPreviewItem.path} />
            </button>
            <figcaption>{heroPreviewItem.caption}</figcaption>
          </figure>
        </div>
      </section>

      <section class="grid-panel">
        <h2 class="section-title">Features</h2>
        <div class="feature-grid">
          <For each={featureItems}>
            {(item) => (
              <article class="feature-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            )}
          </For>
        </div>
      </section>

      <section class="grid-panel" id="download">
        <h2 class="section-title">Downloads</h2>
        <p class="section-subtitle">
          All links below point to <code>releases/latest/download</code> in the public repository.
        </p>
        <div class="download-grid">
          <For each={downloadItems}>
            {(item) => (
              <article class="download-card">
                <p class="download-platform">{item.platform}</p>
                <p class="download-helper">{item.helper}</p>
                <Button
                  as="a"
                  class="download-button"
                  href={releaseUrl(item.asset)}
                  rel="noreferrer"
                  target="_blank"
                  variant="outline"
                >
                  {item.asset}
                </Button>
              </article>
            )}
          </For>
        </div>
      </section>

      <section class="grid-panel">
        <h2 class="section-title">Screenshots</h2>
        <p class="section-subtitle">
          Captured from the desktop app. The Chrome extension shares the same UI in a smaller window.
        </p>
        <div class="screenshot-grid">
          <For each={screenshotItems}>
            {(item) => (
              <figure class="screenshot-card">
                <button
                  class="screenshot-button"
                  onClick={() => openScreenshotModal(item)}
                  type="button"
                >
                  <img alt={item.alt} class="screenshot-image" loading="lazy" src={item.path} />
                </button>
                <figcaption>{item.caption}</figcaption>
              </figure>
            )}
          </For>
        </div>
      </section>

      <Show when={activeScreenshot()}>
        {(item) => (
          <div class="screenshot-modal-backdrop" onClick={closeScreenshotModal} role="presentation">
            <div class="screenshot-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Screenshot preview">
              <div class="screenshot-modal-header">
                <p>{item().caption}</p>
                <button
                  aria-label="Close screenshot preview"
                  class="screenshot-modal-close"
                  onClick={closeScreenshotModal}
                  type="button"
                >
                  ×
                </button>
              </div>
              <div class="screenshot-modal-image-wrap">
                <img
                  alt={item().alt}
                  class="screenshot-modal-image"
                  src={item().path}
                />
              </div>
            </div>
          </div>
        )}
      </Show>

      <section class="notice-panel">
        <p>
          macOS may block unsigned apps on first launch. Run{" "}
          <code>xattr -cr /Applications/AsciiMark.app</code>{" "}
          after installing.
        </p>
        <p>
          Windows SmartScreen may require <strong>More info</strong> and then
          {" "} <strong>Run anyway</strong>.
        </p>
      </section>
    </div>
  );
}
