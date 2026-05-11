//! Pure-Rust helpers (no FFI, no Tauri deps) extracted from `lib.rs`
//! so they can be exercised under `cargo +nightly miri test` via the
//! `tools/miri-helpers-tests` sub-crate.
//!
//! Why a separate file: Miri rejects the main crate because the
//! transitive `ctor` macro (via `tauri-plugin-mcp-bridge`) runs code
//! in `pre_main`, which Miri's interpreter doesn't model. Loom faced
//! the identical problem and we solved it the same way for
//! `tools/loom-watcher-tests`. Here the sub-crate includes this file
//! via `#[path]` so this remains the **single source of truth** for
//! the helpers — touching the function bodies updates both
//! production and the Miri test target.
//!
//! What lives here:
//!
//!   * `Point` / `Size` / `Rect` — plain `#[repr(C)]` geometry types.
//!     The macOS `CGRect` family is just `pub use` aliases of these
//!     in `lib.rs`; the `objc2::encode::Encode` impls land there
//!     (orphan rule). Miri sees the math; AppKit FFI stays out.
//!
//!   * `interpolate_frame(from, to, t)` — linear interpolation of all
//!     four `Rect` components. Used by the macOS window-maximize
//!     animation.
//!
//!   * `ease_out_cubic(t)` — standard easing curve.
//!
//!   * `resolve_within_root(root, relative)` — path-traversal guard.
//!     Canonicalizes both endpoints and rejects anything that
//!     escapes the workspace root via `..`, an absolute path
//!     elsewhere, or a symlink. Touches the filesystem (so Miri
//!     skips the FS-heavy paths via `#[cfg_attr(miri, ignore)]`
//!     guards on the call sites), but the arithmetic /
//!     `Path::starts_with` logic itself is pure.

use std::path::{Path, PathBuf};

/// 2D point. Layout mirrors macOS `CGPoint` so a `pub use` alias in
/// `lib.rs` can ship the `objc2::Encode` impl without a wrapper
/// struct or copy.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// 2D size. Same `#[repr(C)]` rationale as `Point`.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

/// 2D rectangle (origin + size). Layout mirrors macOS `CGRect`.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub origin: Point,
    pub size: Size,
}

/// Linear interpolation of every component of `from` toward `to` at
/// fraction `t ∈ [0, 1]`. Values outside that range are accepted (the
/// caller is expected to clamp via `ease_out_cubic` or similar).
///
/// Mutation-survival contracts (locked in by `tests/helpers.rs`
/// inside the Miri sub-crate AND by the existing tests in
/// `lib.rs::tests`):
///   * Swapping `from + (to - from) * t` for `to + (from - to) * t`
///     fails the endpoint assertion (`t == 0 → from`, `t == 1 → to`).
///   * Dropping any of the four components fails the all-four-axes
///     property test.
pub fn interpolate_frame(from: Rect, to: Rect, t: f64) -> Rect {
    Rect {
        origin: Point {
            x: from.origin.x + (to.origin.x - from.origin.x) * t,
            y: from.origin.y + (to.origin.y - from.origin.y) * t,
        },
        size: Size {
            width: from.size.width + (to.size.width - from.size.width) * t,
            height: from.size.height + (to.size.height - from.size.height) * t,
        },
    }
}

/// Cubic ease-out: `1 - (1 - t)^3`. Pinned at the endpoints
/// (`ease_out_cubic(0) == 0`, `ease_out_cubic(1) == 1`) and
/// monotonically increasing on `[0, 1]`.
pub fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

/// Resolve a path relative to a workspace root. Both endpoints are
/// canonicalized; the result is rejected if the canonical target
/// doesn't start with the canonical root.
///
/// Mutation-survival contracts:
///   * Removing the `target_canon.starts_with(&root_canon)` guard
///     lets `..` escapes through and fails the traversal test.
///   * Swapping the `starts_with` to `target.starts_with(root)`
///     (pre-canonicalization) leaks symlink escapes — the symlink
///     test fails.
pub fn resolve_within_root(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let target = root.join(relative);
    let root_canon = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    let target_canon = std::fs::canonicalize(&target).map_err(|e| e.to_string())?;
    if !target_canon.starts_with(&root_canon) {
        return Err("path escapes workspace root".into());
    }
    Ok(target_canon)
}
