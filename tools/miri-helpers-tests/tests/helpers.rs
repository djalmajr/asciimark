//! Miri-targeted tests for the pure-Rust helpers extracted from
//! `apps/desktop/src-tauri/src/pure_helpers.rs`. Each test names the
//! source mutation it would catch.
//!
//! Run under Miri:
//!   cargo +nightly miri test -p miri-helpers-tests
//!
//! Native run (the same tests, no UB detection):
//!   cargo test -p miri-helpers-tests

use miri_helpers_tests::pure_helpers::{
    ease_out_cubic, interpolate_frame, resolve_within_root, Point, Rect, Size,
};

fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        origin: Point { x, y },
        size: Size { width: w, height: h },
    }
}

// ── interpolate_frame ─────────────────────────────────────────────────

#[test]
fn interpolate_frame_at_t_zero_returns_from() {
    // Mutation captured: swapping the `from` and `to` axes (e.g.
    // `to.x + (from.x - to.x) * t`) returns the destination at t=0
    // and fails this assertion.
    let from = rect(10.0, 20.0, 100.0, 200.0);
    let to = rect(50.0, 60.0, 400.0, 500.0);
    assert_eq!(interpolate_frame(from, to, 0.0), from);
}

#[test]
fn interpolate_frame_at_t_one_returns_to() {
    let from = rect(10.0, 20.0, 100.0, 200.0);
    let to = rect(50.0, 60.0, 400.0, 500.0);
    assert_eq!(interpolate_frame(from, to, 1.0), to);
}

#[test]
fn interpolate_frame_at_midpoint_is_componentwise_halfway() {
    // Mutation captured: dropping any of the four axes (origin.x,
    // origin.y, size.width, size.height) from the interpolation
    // leaves that component stuck at `from` and fails its midpoint
    // check below.
    let from = rect(0.0, 0.0, 0.0, 0.0);
    let to = rect(100.0, 200.0, 300.0, 400.0);
    let mid = interpolate_frame(from, to, 0.5);
    assert_eq!(mid.origin.x, 50.0);
    assert_eq!(mid.origin.y, 100.0);
    assert_eq!(mid.size.width, 150.0);
    assert_eq!(mid.size.height, 200.0);
}

// ── ease_out_cubic ────────────────────────────────────────────────────

#[test]
fn ease_out_cubic_is_pinned_at_endpoints() {
    // Mutation captured: replacing `1 - (1-t)^3` with `(1-t)^3`
    // flips both endpoints and fails this assertion.
    //
    // Native rustc evaluates `1 - (1-0)^3` as exactly 0.0, but
    // Miri uses a slower software float pipeline that surfaces a
    // ~3.3e-16 rounding residue — well below the precision the
    // animation actually cares about. A ±1e-12 tolerance keeps
    // the mutation check sharp without flapping under Miri.
    let near = |a: f64, b: f64| (a - b).abs() < 1e-12;
    assert!(near(ease_out_cubic(0.0), 0.0));
    assert!(near(ease_out_cubic(1.0), 1.0));
}

#[test]
fn ease_out_cubic_is_monotonic_on_unit_interval() {
    // Cubic ease-out must never decrease as t advances. Stricter
    // than the endpoint check — a buggy variant like
    // `1 - (1-t).powi(2)` is still pinned but would shift the slope.
    let mut last = -1.0;
    for i in 0..=20 {
        let t = i as f64 / 20.0;
        let value = ease_out_cubic(t);
        assert!(
            value >= last,
            "ease_out_cubic decreased at t={t} (prev={last}, got={value})",
        );
        last = value;
    }
}

#[test]
fn ease_out_cubic_passes_above_linear_for_small_t() {
    // Ease-OUT means we accelerate fast then decelerate near the
    // end — so for any t in (0, 1), `ease_out_cubic(t) > t`.
    // Mutation captured: swapping it for `ease_in_cubic` (`t^3`)
    // breaks this everywhere except the endpoints.
    for i in 1..20 {
        let t = i as f64 / 20.0;
        assert!(
            ease_out_cubic(t) > t,
            "expected ease_out_cubic({t}) > {t}, got {}",
            ease_out_cubic(t),
        );
    }
}

// ── resolve_within_root ───────────────────────────────────────────────

// The path tests hit `std::fs::canonicalize`, which Miri's shim
// doesn't support on macOS. We gate them with `cfg_attr(miri, ignore)`
// so a Miri run only exercises the pure arithmetic helpers above;
// `cargo test` (native) still validates them.

#[test]
#[cfg_attr(miri, ignore)]
fn resolve_within_root_accepts_in_root_files() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::write(tmp.path().join("a.md"), "x").unwrap();
    let result = resolve_within_root(tmp.path(), "a.md").unwrap();
    assert!(result.ends_with("a.md"));
}

#[test]
#[cfg_attr(miri, ignore)]
fn resolve_within_root_rejects_dotdot_escape() {
    // Mutation captured: removing the `starts_with` check would
    // happily return a path outside the root.
    let tmp = tempfile::tempdir().unwrap();
    let inside = tmp.path().join("inner");
    std::fs::create_dir(&inside).unwrap();
    // Create something outside the root for `..` to resolve to.
    std::fs::write(tmp.path().join("escape.md"), "x").unwrap();
    let err = resolve_within_root(&inside, "../escape.md");
    assert!(err.is_err(), "expected escape rejection, got {err:?}");
}

#[test]
#[cfg_attr(miri, ignore)]
fn resolve_within_root_rejects_missing_target() {
    // Pure canonicalize-fails path: the function returns the OS
    // error message and never reaches the `starts_with` check.
    let tmp = tempfile::tempdir().unwrap();
    let result = resolve_within_root(tmp.path(), "does-not-exist.md");
    assert!(result.is_err());
}
