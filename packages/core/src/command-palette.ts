/**
 * Command palette catalog — pure data + filter. Commands are everything
 * the user can do that isn't tied to a file path: toggle theme, open
 * folder, refresh, export, change editor mode, etc. The host (apps/*)
 * owns the actual `run` callbacks; this module owns the *shape*.
 */

import type { Platform } from "./keyboard-shortcuts.ts";

export type CommandGroup = "File" | "View" | "Theme" | "Workspace" | "Help" | "Language";

export interface Command {
  /** Stable identifier — used by tests and to dedup the catalog. */
  id: string;
  group: CommandGroup;
  /** Human-readable label shown in the palette. */
  title: string;
  /** Optional secondary text (right-aligned in the row). Currently used
   *  to show the keyboard shortcut bound to this command, when any. */
  shortcut?: { mac: readonly string[]; other: readonly string[] };
  /** Optional predicate; when present and false, the command is hidden.
   *  Used for state-dependent visibility (e.g. "Export PDF" only when a
   *  file is open). */
  when?: () => boolean;
  /** Side-effect to run when the user picks this command. */
  run: () => void | Promise<void>;
}

const GROUP_RANK: Record<CommandGroup, number> = {
  File: 0,
  View: 1,
  Theme: 2,
  Workspace: 3,
  Language: 4,
  Help: 5,
};

/**
 * Returns the visible commands for the given query, ordered by:
 *   1. exact title prefix match (case-insensitive)
 *   2. substring match in title
 *   3. substring match in group name
 *   4. group rank, then title alphabetical
 *
 * Mutation-survival contracts (locked in by `command-palette.test.ts`):
 *   - Removing the prefix-bonus collapses 1-2 into one tier and the
 *     "exact prefix outranks substring" assertion fails.
 *   - Letting a `when() === false` command through fails the
 *     "hidden commands are filtered" assertion.
 *   - Returning duplicates by id fails the "ids unique in result" guard.
 */
export function filterCommands(query: string, commands: readonly Command[]): Command[] {
  const visible = commands.filter((c) => !c.when || c.when());

  if (query === "") {
    return [...visible].sort((a, b) => {
      const groupCmp = GROUP_RANK[a.group] - GROUP_RANK[b.group];
      if (groupCmp !== 0) return groupCmp;
      return a.title.localeCompare(b.title);
    });
  }

  const q = query.toLowerCase();
  type Scored = { command: Command; tier: number; titleIdx: number };
  const scored: Scored[] = [];

  for (const command of visible) {
    const title = command.title.toLowerCase();
    const group = command.group.toLowerCase();
    const titleIdx = title.indexOf(q);
    if (titleIdx === 0) {
      scored.push({ command, tier: 0, titleIdx });
      continue;
    }
    if (titleIdx > 0) {
      scored.push({ command, tier: 1, titleIdx });
      continue;
    }
    if (group.includes(q)) {
      scored.push({ command, tier: 2, titleIdx: 0 });
    }
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier <= 1 && a.titleIdx !== b.titleIdx) return a.titleIdx - b.titleIdx;
    const groupCmp = GROUP_RANK[a.command.group] - GROUP_RANK[b.command.group];
    if (groupCmp !== 0) return groupCmp;
    return a.command.title.localeCompare(b.command.title);
  });

  return scored.map((s) => s.command);
}

export function commandShortcutLabel(
  shortcut: Command["shortcut"],
  platform: Platform,
): string {
  if (!shortcut) return "";
  const tokens = platform === "mac" ? shortcut.mac : shortcut.other;
  return tokens.join(platform === "mac" ? " " : "+");
}
