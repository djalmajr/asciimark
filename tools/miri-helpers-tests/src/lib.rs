//! Re-exports `pure_helpers` from the main desktop crate via `#[path]`
//! so the tests in `tests/` can `use miri_helpers_tests::...`. Single
//! source of truth — touching `pure_helpers.rs` updates both
//! production and the Miri target.

#[path = "../../../apps/desktop/src-tauri/src/pure_helpers.rs"]
pub mod pure_helpers;
