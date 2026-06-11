// File-backed slash commands + custom instructions (omp#1, built native).
// A command is a plain Markdown file: an optional leading frontmatter block
// delimited by '---' lines containing simple 'key: value' lines (parsed
// line-based — deliberately NO yaml dependency), followed by the prompt
// template. Hosts collect commands from three sources whose precedence is
// builtin < global < project; the precedence is encoded purely by merge
// order in mergeSlashCommands (later lists override earlier ones by name).

/** One slash command the composer can expand ("/name args" → template). */
export interface SlashCommandDef {
  description?: string;
  name: string;
  source: "builtin" | "global" | "project";
  template: string;
}

/** Workspace-level custom instructions merged into the chat system prompt. */
export interface CustomInstructions {
  mode: "append" | "replace";
  text: string;
}

/** Valid command names: lowercase alphanumeric start, then [a-z0-9_-]. */
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Literal token replaced by the user's arguments on expansion. */
const ARGUMENTS_TOKEN = "$ARGUMENTS";

interface FrontmatterSplit {
  body: string;
  fields: Map<string, string>;
}

/** Split an optional leading '---' frontmatter block off `raw`. Only simple
 *  'key: value' lines are honored (keys lowercased, values trimmed); an
 *  unterminated block is NOT frontmatter — the whole text stays body. */
function splitFrontmatter(raw: string): FrontmatterSplit {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { body: raw, fields: new Map() };
  const fields = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") {
      return { body: lines.slice(i + 1).join("\n"), fields };
    }
    const sep = line.indexOf(":");
    if (sep > 0) {
      fields.set(line.slice(0, sep).trim().toLowerCase(), line.slice(sep + 1).trim());
    }
  }
  return { body: raw, fields: new Map() };
}

/**
 * Parse one command file into a {@link SlashCommandDef}. `name` (typically
 * the file name sans extension) is lowercased before validation. Returns null
 * when the normalized name is invalid or the template (trimmed body) is empty
 * — a bad file must never produce a half-formed command.
 */
export function parseSlashCommandFile(
  name: string,
  raw: string,
  source: SlashCommandDef["source"],
): SlashCommandDef | null {
  const normalized = name.toLowerCase();
  if (!NAME_RE.test(normalized)) return null;
  const { body, fields } = splitFrontmatter(raw);
  const template = body.trim();
  if (!template) return null;
  const description = fields.get("description");
  return {
    ...(description ? { description } : {}),
    name: normalized,
    source,
    template,
  };
}

/**
 * Merge command lists where LATER lists override earlier ones by name — call
 * as mergeSlashCommands(builtin, global, project) to encode the precedence
 * builtin < global < project. Result is sorted by name.
 */
export function mergeSlashCommands(...lists: SlashCommandDef[][]): SlashCommandDef[] {
  const byName = new Map<string, SlashCommandDef>();
  for (const list of lists) {
    for (const command of list) byName.set(command.name, command);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Expand a command template with the user's arguments: every literal
 * `$ARGUMENTS` occurrence is replaced by `args` (which may be ""). A template
 * without the token still receives non-empty args, appended after a blank
 * line, so "/cmd extra context" never silently drops the extra text.
 */
export function expandSlashCommand(template: string, args: string): string {
  if (template.includes(ARGUMENTS_TOKEN)) {
    return template.split(ARGUMENTS_TOKEN).join(args);
  }
  return args ? `${template}\n\n${args}` : template;
}

/**
 * Parse a custom-instructions file (same frontmatter style). The only honored
 * key is `mode`: "replace" or "append" — anything else (or no frontmatter)
 * falls back to "append". Returns null when the body is empty.
 */
export function parseInstructionsFile(raw: string): CustomInstructions | null {
  const { body, fields } = splitFrontmatter(raw);
  const text = body.trim();
  if (!text) return null;
  return { mode: fields.get("mode") === "replace" ? "replace" : "append", text };
}
