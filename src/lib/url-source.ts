/**
 * URL-based data source for the viewer.
 * Fetches .adoc files via the background service worker,
 * supporting both file:// and https:// URLs.
 */

/** Whether chrome.runtime messaging is available (real extension context) */
const hasRuntime =
  typeof chrome !== "undefined" &&
  chrome?.runtime?.sendMessage !== undefined;

/** Send a message to the background service worker */
async function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  if (!hasRuntime) {
    throw new Error("chrome.runtime.sendMessage not available");
  }
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/**
 * Fetch a file's text content.
 * Uses the service worker in extension context, or direct fetch() in dev mode.
 */
export async function fetchFileByUrl(url: string): Promise<string> {
  if (hasRuntime) {
    const resp = await sendMessage<{ text?: string; error?: string }>({
      action: "fetch-file",
      url,
    });
    if (resp.error) throw new Error(resp.error);
    return resp.text ?? "";
  }

  // Dev mode fallback: direct fetch
  const resp = await fetch(url, {
    headers: { "Cache-Control": "no-cache", Accept: "text/plain" },
  });
  if (!resp.ok && resp.status !== 0) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

/** Check if the extension has file:// access */
export async function checkFileAccess(): Promise<boolean> {
  if (!hasRuntime) return true; // Dev mode — assume ok
  try {
    const resp = await sendMessage<{ allowed?: boolean }>({
      action: "check-file-access",
    });
    return resp.allowed ?? false;
  } catch {
    return true;
  }
}

/** Extract the directory portion of a URL (everything up to the last /) */
export function dirOfUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  return idx >= 0 ? url.substring(0, idx) : url;
}

/** Extract the filename from a URL */
export function fileNameFromUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  const name = idx >= 0 ? url.substring(idx + 1) : url;
  // Remove query string
  const qIdx = name.indexOf("?");
  return qIdx >= 0 ? name.substring(0, qIdx) : name;
}

/**
 * Resolve a relative include path against a base URL.
 * Handles ../ and ./ segments.
 */
export function resolveUrl(baseUrl: string, relativePath: string): string {
  // If already absolute URL, return as-is
  if (/^(file|https?):\/\//i.test(relativePath)) return relativePath;

  const baseParts = baseUrl.split("/");
  const relParts = relativePath.split("/");

  for (const part of relParts) {
    if (part === "..") {
      baseParts.pop();
    } else if (part !== "." && part !== "") {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}

/**
 * Read a file by resolving a relative path against a base URL.
 * Used as the `readFile` function for convertAdoc in URL mode.
 */
export function createUrlReadFile(
  baseUrl: string,
): (path: string) => Promise<string | null> {
  return async (path: string): Promise<string | null> => {
    const fullUrl = resolveUrl(baseUrl, path);
    try {
      return await fetchFileByUrl(fullUrl);
    } catch {
      return null;
    }
  };
}

/**
 * Extract a display-friendly path from a URL.
 * file:///Users/x/docs/readme.adoc → readme.adoc
 * https://example.com/docs/readme.adoc → example.com/docs/readme.adoc
 */
export function displayPathFromUrl(url: string): string {
  if (url.startsWith("file://")) {
    return fileNameFromUrl(url);
  }
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return fileNameFromUrl(url);
  }
}

/** Check if a URL is a file:// URL */
export function isFileUrl(url: string): boolean {
  return url.startsWith("file://");
}
