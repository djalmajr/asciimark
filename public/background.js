// Service worker: handles extension icon click + file fetching for content scripts

// Open the viewer as a new tab when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

// Handle messages from the viewer page (fetch files for include:: resolution etc.)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "fetch-file") {
    fetchFile(message.url)
      .then((text) => sendResponse({ text }))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === "check-file-access") {
    chrome.extension.isAllowedFileSchemeAccess().then((allowed) => {
      sendResponse({ allowed });
    });
    return true;
  }
});

async function fetchFile(url) {
  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Accept: "text/plain, */*",
    },
  });

  // file:// URLs return status 0 on success
  if (!response.ok && response.status !== 0) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}
