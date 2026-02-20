# Privacy Policy - AsciiMark

**Last updated:** February 19, 2026

## Data Collection

AsciiMark does **not** collect, store, or transmit any personal data or user information.

## What AsciiMark Does

AsciiMark is a browser extension that renders AsciiDoc and Markdown files as formatted HTML. All processing happens **entirely locally** in your browser.

## Local Storage

AsciiMark stores the following data locally in your browser. None of this data ever leaves your device:

- **Theme preference** (light/dark) in `localStorage`
- **Last opened directory handle** in `IndexedDB` (for session restore when reopening the browser)

## Permissions Explained

- **storage**: Used to temporarily pass document content from the page to the extension viewer via `chrome.storage.session`. This data is session-only and is automatically cleared when the browser closes.
- **File URL access** (optional): If you enable "Allow access to file URLs" in the extension settings, AsciiMark can render `.adoc` and `.md` files opened from your local filesystem. This is not enabled by default and requires manual opt-in. No file content is transmitted anywhere.

## Network Requests

AsciiMark makes **no network requests** except when you open a document hosted on a remote URL (e.g., `https://`). In that case, the extension fetches the document content directly from that URL for rendering. No data is sent to any third-party server.

## Third-Party Libraries

AsciiMark bundles the following open-source libraries for local processing only. None of them make network requests or collect data:

- **@asciidoctor/core** - AsciiDoc to HTML conversion
- **markdown-it** (+ plugins) - Markdown to HTML conversion
- **highlight.js** - Syntax highlighting for code blocks
- **Mermaid** - Diagram rendering
- **KaTeX** - Math expression rendering

## Third-Party Services

AsciiMark does **not** use any third-party analytics, tracking, or telemetry services.

## Changes

If this policy changes, the update will be posted here.

## Contact

For questions about this privacy policy, open an issue at [github.com/djalmajr/asciimark](https://github.com/djalmajr/asciimark/issues).
