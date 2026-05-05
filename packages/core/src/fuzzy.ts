import { Fzf } from "fzf";
import type { IndexedFile } from "./file-index.ts";

export interface RankedResult {
  file: IndexedFile;
  score: number;
  /** Sorted positions inside `file.name` to highlight; empty if the match was on the path. */
  namePositions: number[];
  /** Sorted positions inside `file.path` to highlight; empty if the match was on the name. */
  pathPositions: number[];
}

export interface FuzzyOptions {
  /** Set of `${rootId}::${path}` keys to boost. The current Quick Open caller
   *  feeds `getRecentFiles()` here so files the user already opened recently
   *  surface ahead of equal-quality matches. */
  recents?: ReadonlySet<string>;
  /** Cap on the returned list. Default 50 — the overlay only renders that many
   *  rows so anything below cuts straight to wasted CPU. */
  limit?: number;
}

/**
 * Additive bonus applied to basename matches and to recents. The exact value
 * isn't load-bearing — we only need it to clear the realistic spread of fzf
 * raw scores (which sit in the 0-200 range for typical file paths). The
 * mutation tests in `fuzzy.test.ts` lock in that this constant being zero
 * (or recents/name being ignored) breaks observable ranking.
 */
const NAME_BONUS = 100;
const RECENT_BONUS = 100;

function recentKey(file: IndexedFile): string {
  return `${file.rootId}::${file.path}`;
}

export function fuzzyFilter(
  query: string,
  files: readonly IndexedFile[],
  opts: FuzzyOptions = {},
): RankedResult[] {
  const limit = opts.limit ?? 50;
  const recents = opts.recents ?? new Set<string>();

  if (query === "") {
    const recent: RankedResult[] = [];
    const rest: RankedResult[] = [];
    for (const file of files) {
      const result: RankedResult = { file, score: 0, namePositions: [], pathPositions: [] };
      if (recents.has(recentKey(file))) recent.push(result);
      else rest.push(result);
    }
    return [...recent, ...rest].slice(0, limit);
  }

  const fileList = files as IndexedFile[];

  // Match against basename first — most Quick Open queries are filename-based
  // ("readme", "app.tsx") rather than path fragments ("src/components/app").
  const nameFzf = new Fzf(fileList, {
    selector: (f) => f.name,
    fuzzy: "v2",
    casing: "smart-case",
    normalize: true,
  });
  const nameMatches = nameFzf.find(query);

  // For files that the basename pass missed, try the full path. This catches
  // "comp/btn" → "components/button.tsx" style queries.
  const seen = new Set(nameMatches.map((m) => recentKey(m.item)));
  const remaining = fileList.filter((f) => !seen.has(recentKey(f)));
  const pathFzf = new Fzf(remaining, {
    selector: (f) => f.path,
    fuzzy: "v2",
    casing: "smart-case",
    normalize: true,
  });
  const pathMatches = pathFzf.find(query);

  const combined: RankedResult[] = [];

  for (const match of nameMatches) {
    const file = match.item;
    const recentBoost = recents.has(recentKey(file)) ? RECENT_BONUS : 0;
    combined.push({
      file,
      score: match.score + NAME_BONUS + recentBoost,
      namePositions: sortedPositions(match.positions),
      pathPositions: [],
    });
  }

  for (const match of pathMatches) {
    const file = match.item;
    const recentBoost = recents.has(recentKey(file)) ? RECENT_BONUS : 0;
    combined.push({
      file,
      score: match.score + recentBoost,
      namePositions: [],
      pathPositions: sortedPositions(match.positions),
    });
  }

  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, limit);
}

function sortedPositions(positions: Set<number>): number[] {
  return [...positions].sort((a, b) => a - b);
}
