import { createSignal } from "solid-js";
import IconShieldAlert from "~icons/lucide/shield-alert";
import { Button } from "./ui/button.tsx";
import { checkFileAccess } from "../lib/url-source.ts";

interface FileAccessWarningProps {
  url: string;
}

export function FileAccessWarning(props: FileAccessWarningProps) {
  const [checking, setChecking] = createSignal(false);

  async function handleRetry() {
    setChecking(true);
    const allowed = await checkFileAccess();
    setChecking(false);
    if (allowed) {
      // Reload the page to retry with the URL
      location.reload();
    }
  }

  return (
    <div class="empty-state">
      <div class="empty-icon" style={{ color: "hsl(var(--destructive))" }}>
        <IconShieldAlert width={64} height={64} />
      </div>
      <h2>File access not enabled</h2>
      <p style={{ "max-width": "480px", "text-align": "center" }}>
        To preview local <code>.adoc</code> files, you need to enable file
        access for this extension:
      </p>
      <ol
        style={{
          "text-align": "left",
          "max-width": "480px",
          "line-height": "1.8",
          "margin": "8px 0 16px",
          "padding-left": "20px",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <li>
          Open{" "}
          <code
            style={{
              padding: "2px 6px",
              background: "hsl(var(--secondary))",
              "border-radius": "4px",
              "font-size": "0.85em",
            }}
          >
            chrome://extensions
          </code>
        </li>
        <li>Find "AsciiDoc Viewer" and click <strong>Details</strong></li>
        <li>
          Enable <strong>"Allow access to file URLs"</strong>
        </li>
        <li>Come back here and click the button below</li>
      </ol>
      <Button size="lg" onClick={handleRetry} disabled={checking()}>
        {checking() ? "Checking..." : "Retry"}
      </Button>
    </div>
  );
}
