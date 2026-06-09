//! `asciimark-preview://` — a custom URI scheme that serves a single HTML
//! file's DIRECTORY as an isolated web origin, so multi-file pages and SPAs
//! preview with full fidelity. The scheme is app-namespaced (not a generic
//! `htmlpreview`) to avoid colliding with other apps' custom schemes.
//!
//! Why a scheme and not the `asset:` protocol + `<base href>`: `convertFileSrc`
//! encodes the whole path as one opaque segment, so a page's **root-absolute**
//! URLs (`/index.js`, `/assets/app.css`, importmap `~/` → `/`) resolve against
//! the asset origin root (the filesystem root), not the project folder — they
//! 404. Here every preview gets its own origin `asciimark-preview://<token>`,
//! whose root maps to the file's directory, so `/index.js` → `<dir>/index.js`
//! and ES modules / importmaps / hash routing all work.
//!
//! ## Isolation
//! The previewed page lives in the `asciimark-preview://<token>` origin,
//! distinct from the app's `tauri://localhost`. The frontend frames it sandboxed
//! (`allow-scripts allow-same-origin`, where "same-origin" means the preview's
//! OWN origin, not the app's). Tauri injects its IPC bridge per top-level
//! webview, not into page-created sub-frames, and no capability grants this
//! origin any command — so the previewed page cannot reach the Tauri IPC or the
//! host DOM. Only directories explicitly registered via `html_preview_register`
//! are servable (an allowlist), and each request is path-traversal-guarded both
//! lexically and via canonicalization.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use percent_encoding::percent_decode_str;
use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager, Runtime};

/// The custom URI scheme. App-namespaced to avoid collisions; the frontend
/// builds `asciimark-preview://<token>/<file>` URLs against this.
pub const SCHEME: &str = "asciimark-preview";

/// Maps preview tokens to the directory they serve, plus an optional in-memory
/// overlay so the file currently open in the editor previews its UNSAVED buffer
/// (the rest of the tree still comes from disk).
#[derive(Default)]
pub struct HtmlPreviewState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    next_id: u64,
    by_token: HashMap<String, PathBuf>,
    by_dir: HashMap<PathBuf, String>,
    /// token → (normalized rel path, live content) for the open file.
    overlay: HashMap<String, (String, String)>,
}

/// Register `dir` for previewing and return its (stable, per-session) token.
/// Idempotent: the same canonical directory always yields the same token, so
/// the iframe URL stays cache-friendly across re-previews.
#[tauri::command]
pub fn html_preview_register(
    state: tauri::State<'_, HtmlPreviewState>,
    dir: String,
) -> Result<String, String> {
    let canon = std::fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    if !canon.is_dir() {
        return Err("html_preview_register: not a directory".into());
    }
    let mut inner = state.inner.lock().unwrap();
    if let Some(token) = inner.by_dir.get(&canon) {
        return Ok(token.clone());
    }
    let token = format!("r{}", inner.next_id);
    inner.next_id += 1;
    inner.by_token.insert(token.clone(), canon.clone());
    inner.by_dir.insert(canon, token.clone());
    Ok(token)
}

/// Set the live overlay for `token`: requests for `rel_path` serve `content`
/// (the editor's current, possibly unsaved, buffer) instead of the disk file.
#[tauri::command]
pub fn html_preview_set_overlay(
    state: tauri::State<'_, HtmlPreviewState>,
    token: String,
    rel_path: String,
    content: String,
) {
    let mut inner = state.inner.lock().unwrap();
    if inner.by_token.contains_key(&token) {
        inner.overlay.insert(token, (clean_rel(&rel_path), content));
    }
}

/// Drop the live overlay for `token` (e.g. when the preview closes), so future
/// requests fall back to disk.
#[tauri::command]
pub fn html_preview_clear_overlay(state: tauri::State<'_, HtmlPreviewState>, token: String) {
    state.inner.lock().unwrap().overlay.remove(&token);
}

/// Serve one `asciimark-preview://<token>/<path>` request. Registered on the Tauri
/// builder; runs on Tauri's protocol thread (blocking file IO is fine — preview
/// assets are small and local).
pub fn serve<R: Runtime>(app: &AppHandle<R>, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let state = app.state::<HtmlPreviewState>();
    let uri = request.uri();
    let token = uri.host().unwrap_or("").to_string();
    // Path arrives percent-encoded; decode, then lexically strip `..`/`.`/root.
    let decoded = percent_decode_str(uri.path()).decode_utf8_lossy();
    let mut rel = clean_rel(&decoded);
    if rel.is_empty() {
        rel = "index.html".to_string();
    }

    let inner = state.inner.lock().unwrap();
    let Some(root) = inner.by_token.get(&token).cloned() else {
        return not_found();
    };
    // Live overlay wins for the open file (shows unsaved edits).
    if let Some((orel, content)) = inner.overlay.get(&token) {
        if *orel == rel {
            return ok(content.clone().into_bytes(), content_type_for("page.html"));
        }
    }
    drop(inner);

    // `clean_rel` already removed traversal lexically; canonicalize is the
    // second guard, catching symlinks that point outside the root.
    let candidate = root.join(&rel);
    let Ok(canon) = std::fs::canonicalize(&candidate) else {
        return not_found();
    };
    if !canon.starts_with(&root) {
        return not_found();
    }
    match std::fs::read(&canon) {
        Ok(bytes) => ok(bytes, content_type_for(&rel)),
        Err(_) => not_found(),
    }
}

/// Lexically normalize a URL path into a safe relative path: percent-decoded
/// already, here we drop the leading slash and every `.`/`..`/root component,
/// keeping only `Normal` segments. `..` can never climb out of the root.
fn clean_rel(path: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    for comp in Path::new(path).components() {
        if let Component::Normal(s) = comp {
            parts.push(s.to_string_lossy().to_string());
        }
    }
    parts.join("/")
}

/// Content-Type by extension. Critical: `.js`/`.mjs` MUST be `text/javascript`
/// (not `text/plain`) or the webview refuses to execute `<script type=module>`,
/// which is the whole point of serving SPAs.
fn content_type_for(rel: &str) -> &'static str {
    let ext = Path::new(rel)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" | "cjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "webmanifest" => "application/manifest+json; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "txt" | "md" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "wasm" => "application/wasm",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

fn ok(bytes: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(200)
        .header("Content-Type", content_type)
        // The preview page is same-origin to its own assets; no app code reads
        // these, so keep them uncached during live editing.
        .header("Cache-Control", "no-store")
        .body(bytes)
        .unwrap()
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(404)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(b"Not Found".to_vec())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_rel_strips_traversal_and_roots() {
        // Mutation: keeping `..` would let `htmlpreview://t/../../etc/passwd`
        // climb out of the served directory.
        assert_eq!(clean_rel("/../../etc/passwd"), "etc/passwd");
        assert_eq!(clean_rel("/assets/../assets/app.js"), "assets/assets/app.js");
        assert_eq!(clean_rel("/./index.html"), "index.html");
        assert_eq!(clean_rel("/"), "");
        assert_eq!(clean_rel("/a/b/c.css"), "a/b/c.css");
    }

    #[test]
    fn clean_rel_join_stays_under_root() {
        let root = Path::new("/srv/preview");
        let joined = root.join(clean_rel("/../../../etc/shadow"));
        assert!(joined.starts_with(root), "join escaped root: {joined:?}");
    }

    #[test]
    fn content_type_modules_are_javascript() {
        // Mutation: returning text/plain here breaks ES module execution.
        assert_eq!(content_type_for("a.js"), "text/javascript; charset=utf-8");
        assert_eq!(content_type_for("a.mjs"), "text/javascript; charset=utf-8");
        assert_eq!(content_type_for("index.html"), "text/html; charset=utf-8");
        assert_eq!(content_type_for("s.css"), "text/css; charset=utf-8");
        assert_eq!(content_type_for("blob.bin"), "application/octet-stream");
    }
}
