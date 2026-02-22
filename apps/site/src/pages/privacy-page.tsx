export function PrivacyPage() {
  return (
    <div class="page-stack">
      <section class="content-panel privacy-panel">
        <h1 class="content-title">Privacy Policy</h1>
        <p>
          <strong>Last updated:</strong> February 22, 2026
        </p>
        <h2>Data collection</h2>
        <p>AsciiMark does not collect, store, or transmit personal data or telemetry.</p>
        <h2>Local processing</h2>
        <p>
          Rendering happens locally in your browser or desktop app. Document content is not
          uploaded by AsciiMark infrastructure.
        </p>
        <h2>Local storage usage</h2>
        <ul>
          <li>Theme preference in <code>localStorage</code>.</li>
          <li>
            Last opened directory/file handles in browser storage for session restore and quicker
            reopen.
          </li>
        </ul>
        <h2>Permissions explained</h2>
        <ul>
          <li>
            <strong>storage</strong>: used to temporarily pass content between extension contexts
            during rendering flows.
          </li>
          <li>
            <strong>File URL access</strong> (optional): enables rendering local
            <code> file://</code> documents when user explicitly allows it in extension settings.
          </li>
        </ul>
        <h2>Network requests</h2>
        <p>
          AsciiMark only fetches content when you open a remote URL directly. It does not upload
          your document content to AsciiMark servers.
        </p>
        <h2>Third-party libraries</h2>
        <p>
          AsciiMark bundles open-source packages for local parsing and rendering, including:
        </p>
        <ul>
          <li>@asciidoctor/core</li>
          <li>markdown-it and plugins</li>
          <li>highlight.js</li>
          <li>Mermaid</li>
          <li>KaTeX</li>
        </ul>
        <h2>Third-party services</h2>
        <p>AsciiMark does not use analytics, trackers, or advertising services.</p>
        <h2>Policy changes</h2>
        <p>Any future updates to this policy are published on this page.</p>
      </section>
    </div>
  );
}
