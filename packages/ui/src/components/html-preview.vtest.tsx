import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { HtmlPreview } from "./html-preview.tsx";

function frame(container: HTMLElement): HTMLIFrameElement {
  const el = container.querySelector("iframe.html-preview-frame");
  if (!el) throw new Error("html-preview-frame not rendered");
  return el as HTMLIFrameElement;
}

describe("HtmlPreview", () => {
  it("renders the source inside a sandboxed iframe (no allow-same-origin)", () => {
    const { container } = render(() => <HtmlPreview content="<p>hi</p>" />);
    const iframe = frame(container);
    // Mutation: dropping the sandbox attribute would let the page reach the
    // host app + Tauri IPC. allow-same-origin must NEVER be present.
    const sandbox = iframe.getAttribute("sandbox") ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(iframe.getAttribute("srcdoc")).toContain("<p>hi</p>");
  });

  it("injects a <base href> after an existing <head> so relative paths resolve", () => {
    const html = "<html><head><title>x</title></head><body><img src='a.png'></body></html>";
    const { container } = render(() => (
      <HtmlPreview content={html} baseHref="asset://localhost/dir/" />
    ));
    const doc = frame(container).getAttribute("srcdoc") ?? "";
    // Base lands immediately after <head>, before the title — so relative
    // resources resolve against the file's directory.
    expect(doc).toContain('<head><base href="asset://localhost/dir/">');
    expect(doc.indexOf("<base")).toBeLessThan(doc.indexOf("<title>"));
  });

  it("prepends <base> when the document has no <head>", () => {
    const { container } = render(() => (
      <HtmlPreview content="<p>fragment</p>" baseHref="asset://localhost/dir/" />
    ));
    const doc = frame(container).getAttribute("srcdoc") ?? "";
    expect(doc.startsWith('<base href="asset://localhost/dir/">')).toBe(true);
  });

  it("omits <base> entirely when no baseHref is given", () => {
    const { container } = render(() => <HtmlPreview content="<p>x</p>" />);
    const doc = frame(container).getAttribute("srcdoc") ?? "";
    expect(doc).not.toContain("<base");
  });

  it("escapes quotes in the baseHref so the injected tag can't break out", () => {
    const { container } = render(() => (
      <HtmlPreview content="<p>x</p>" baseHref={'asset://x"/><script>evil()</script>'} />
    ));
    const doc = frame(container).getAttribute("srcdoc") ?? "";
    // The double-quote is entity-encoded, so no premature attribute close.
    expect(doc).toContain("&quot;");
    expect(doc).not.toContain('"><script>evil()');
  });

  it("debounces live edits — the frame keeps the initial doc until the timer fires", async () => {
    const [content, setContent] = createSignal("<p>first</p>");
    const { container } = render(() => <HtmlPreview content={content()} />);
    expect(frame(container).getAttribute("srcdoc")).toContain("first");

    setContent("<p>second</p>");
    // Synchronously after the edit the frame still shows the old doc (debounced).
    expect(frame(container).getAttribute("srcdoc")).toContain("first");

    await new Promise((r) => setTimeout(r, 400));
    expect(frame(container).getAttribute("srcdoc")).toContain("second");
  });
});
