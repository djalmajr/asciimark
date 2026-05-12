import { describe, expect, it } from "bun:test";
import { decideCloseAction } from "./window-close.ts";

describe("decideCloseAction", () => {
  it("default 'tray' setting hides the window when the updater is idle", () => {
    // Mutation captured: dropping the `return "hide"` fallback (e.g.
    // flipping the default to "let-close") would make the standard
    // window-X click quit the app for every user on the default
    // setting — a silent regression of the pre-DJA-50 behaviour.
    expect(
      decideCloseAction({ closeBehavior: "tray", isUpdating: false }),
    ).toBe("hide");
  });

  it("'quit' setting lets the window close when the updater is idle", () => {
    // Mutation captured: a handler that ignores the `closeBehavior`
    // preference (e.g. always returns "hide") would render the
    // setting inert — the user toggles "Quit app" and nothing
    // observable changes.
    expect(
      decideCloseAction({ closeBehavior: "quit", isUpdating: false }),
    ).toBe("let-close");
  });

  it("updater bypass forces let-close even when the user picked 'tray'", () => {
    // Mutation captured: dropping the `if (args.isUpdating)` guard
    // would re-introduce the freeze fixed in 558de26 — the
    // Tauri updater needs the window to actually close so the
    // relaunched binary can take over. A "hide" return here would
    // strand the install half-applied.
    expect(
      decideCloseAction({ closeBehavior: "tray", isUpdating: true }),
    ).toBe("let-close");
  });

  it("updater bypass is consistent with the 'quit' setting", () => {
    // Sanity check: both 'updater is running' and 'user prefers
    // quit' independently produce let-close, so their combination
    // must too. Catches a regression where the updater branch
    // accidentally short-circuits to "hide" on the wrong precedence
    // ordering.
    expect(
      decideCloseAction({ closeBehavior: "quit", isUpdating: true }),
    ).toBe("let-close");
  });
});
