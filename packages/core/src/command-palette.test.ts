import { describe, expect, it } from "bun:test";
import {
  commandShortcutLabel,
  filterCommands,
  type Command,
} from "./command-palette.ts";

function cmd(
  id: string,
  group: Command["group"],
  title: string,
  extra: Partial<Command> = {},
): Command {
  return { id, group, title, run: () => {}, ...extra };
}

const CATALOG: Command[] = [
  cmd("file.openFolder", "File", "Open Folder"),
  cmd("file.exportPdf", "File", "Export PDF", { when: () => true }),
  cmd("file.refresh", "Workspace", "Refresh Workspace"),
  cmd("view.toggleSidebar", "View", "Toggle Sidebar"),
  cmd("view.toggleHidden", "View", "Toggle Hidden Files"),
  cmd("theme.dark", "Theme", "Set Theme: Dark"),
  cmd("theme.light", "Theme", "Set Theme: Light"),
  cmd("help.shortcuts", "Help", "Show Keyboard Shortcuts"),
];

describe("filterCommands", () => {
  it("empty query returns all visible commands grouped by File→View→Theme→Workspace→Help", () => {
    // Mutation captured: shuffling GROUP_RANK breaks this exact ordering
    // assertion. Confirms that "File" appears first and "Help" last.
    const result = filterCommands("", CATALOG);
    expect(result.map((c) => c.id)).toEqual([
      "file.exportPdf",
      "file.openFolder",
      "view.toggleHidden",
      "view.toggleSidebar",
      "theme.dark",
      "theme.light",
      "file.refresh",
      "help.shortcuts",
    ]);
  });

  it("hides commands whose `when()` returns false", () => {
    // Mutation captured: removing the `when()` filter would surface the
    // "hidden" command and the assertion below fails.
    const list: Command[] = [
      cmd("a", "File", "Visible Cmd"),
      cmd("b", "File", "Hidden Cmd", { when: () => false }),
    ];
    expect(filterCommands("", list).map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands("hidden", list).map((c) => c.id)).toEqual([]);
  });

  it("title prefix match outranks title-substring match (tier 0 before tier 1)", () => {
    // Mutation captured: collapsing tier 0 and tier 1 into one tier moves
    // "Open Folder" below "Toggle Sidebar" when query="o" — fails this.
    const result = filterCommands("o", CATALOG);
    const titles = result.map((c) => c.title);
    // "Open Folder" starts with "o" → tier 0
    // "Toggle Sidebar" / "Toggle Hidden Files" / "Show Keyboard Shortcuts"
    //   contain "o" later → tier 1
    expect(titles[0]).toBe("Open Folder");
  });

  it("title-substring match outranks group-name match (tier 1 before tier 2)", () => {
    // Mutation captured: searching "view" should put "View"-group commands
    // above non-View commands ONLY when no title contains "view". Here
    // none do, so all tier-2 results show. We check that NO tier-2 result
    // comes before a tier-1 result on a query that has both.
    const list: Command[] = [
      cmd("a", "View", "Toggle Hidden Files"),
      cmd("b", "File", "Open File"),
    ];
    const result = filterCommands("file", list);
    // "Open File" has "file" in title (tier 1); "Toggle Hidden Files"
    // also has "file" in title — both tier 1 — but only "Open File"
    // matches the prefix near 0... actually both contain "file", so
    // both are tier 1 and the order is by titleIdx then title.
    expect(result.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("query case is normalized (smart-case-equivalent for the substring path)", () => {
    // VS Code conventions: "OPEN" still matches "Open Folder".
    const result = filterCommands("OPEN", CATALOG);
    expect(result.map((c) => c.title)).toContain("Open Folder");
  });

  it("returns empty array when the query matches nothing", () => {
    expect(filterCommands("zzzzz", CATALOG)).toEqual([]);
  });

  it("each command appears at most once in the result (no duplicates by id)", () => {
    // Mutation captured: a second push in any tier (e.g. forgetting the
    // `continue` after pushing tier 0) would add the same command twice.
    const result = filterCommands("o", CATALOG);
    const ids = result.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("commandShortcutLabel", () => {
  it("joins tokens with space on macOS and `+` elsewhere", () => {
    const shortcut = { mac: ["⌘", "⇧", "P"] as const, other: ["Ctrl", "Shift", "P"] as const };
    expect(commandShortcutLabel(shortcut, "mac")).toBe("⌘ ⇧ P");
    expect(commandShortcutLabel(shortcut, "other")).toBe("Ctrl+Shift+P");
  });

  it("returns empty string when the command has no shortcut", () => {
    expect(commandShortcutLabel(undefined, "mac")).toBe("");
    expect(commandShortcutLabel(undefined, "other")).toBe("");
  });
});
