// Content script: injected into pages matching *.adoc / *.md patterns
// Detects plain-text files and redirects to the extension viewer
(() => {
  // Only act on plain-text pages (Chrome renders them as a single <pre> inside <body>)
  if (document.body.children.length !== 1) return;
  const pre = document.body.querySelector("pre");
  if (!pre) return;

  // Build the viewer URL with the current page URL as a parameter
  const viewerUrl =
    chrome.runtime.getURL("index.html") +
    "?url=" +
    encodeURIComponent(location.href);

  // Replace current page with the viewer
  location.replace(viewerUrl);
})();
