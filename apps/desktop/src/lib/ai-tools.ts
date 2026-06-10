// In-process AI tools: give the assistant direct, permissioned access to the
// ACTIVE document and the current workspace — context an external MCP server
// can't reach (the open buffer / selection). Each is an engine-neutral AITool
// whose execute reads app state or calls an existing Tauri command. Read/search
// tools run immediately; the edit tool stages a proposal for user Accept/Reject
// (it never mutates the document without approval).

import { invoke } from "./chaos-invoke.ts";
import type {
  ExcalidrawApplyMode,
  ExcalidrawWriteInput,
  ExcalidrawWriteResult,
} from "../components/excalidraw-frame.tsx";
import type { AITool } from "@asciimark/ai/types.ts";

/** Filesystem bridge for the creation/read tools. Paths are workspace-relative
 *  and validated by the Rust side (rejects `..`/absolute paths, creates parent
 *  dirs, refuses overwrite on create). Optional: hosts without a real fs (the
 *  extension) simply don't register those tools. */
export interface ToolFsBridge {
  createDir: (root: string, relative: string) => Promise<void>;
  createFile: (root: string, relative: string) => Promise<void>;
  readFileRelative: (root: string, relative: string) => Promise<string | null>;
  /** Write content to an ABSOLUTE path (host joins root + relative). */
  writeFileAbs: (absPath: string, content: string) => Promise<void>;
}

export interface InProcessToolDeps {
  /** Filesystem bridge enabling app__read_file / app__create_file /
   *  app__create_folder. Omitted -> those tools are not offered. */
  fs?: ToolFsBridge;
  /** Full text of the document the user is currently editing. */
  getActiveDoc: () => string;
  /** Active document's path (or null when an untitled/empty tab is focused). */
  getActiveDocPath: () => string | null;
  /** Compact text outline of the active `.excalidraw` scene (the canvas lives
   *  in a guest frame, so the editor buffer is empty). Resolves to null when
   *  the active view isn't an Excalidraw, the frame isn't ready, or the scene
   *  is empty. Optional so non-Excalidraw hosts can omit it. */
  getActiveExcalidrawOutline?: () => Promise<string | null>;
  /** Absolute paths of the open workspace roots. */
  getWorkspaceRoots: () => string[];
  /** Stage an edit proposal for the user to Accept/Reject. Resolves to a short
   *  status string fed back to the model (applied / rejected / not found). */
  proposeEdit: (edit: { find: string; replace: string }) => Promise<string>;
  /** Draw/update a diagram in the active `.excalidraw` from Mermaid text.
   *  Returns a failure result (not a throw) when no diagram is open. */
  applyExcalidrawMermaid: (input: ExcalidrawWriteInput) => Promise<ExcalidrawWriteResult>;
}

const APPLY_MODES: readonly ExcalidrawApplyMode[] = ["replace-selection", "append", "replace-all"];

/** Mirror of the Rust `FileMatch` (find_in_files), camelCased over IPC. */
interface FileMatch {
  path: string;
  lineNumber: number;
  lineText: string;
}

interface DirEntryLite {
  name: string;
  kind: string;
  path: string;
}

const APP = "app";
const SEARCH_RESULT_CAP = 50;

// Steers the model away from app__propose_edit (a text-replace that can't touch
// the canvas) and toward the Excalidraw write tool when reading a diagram.
const EXCALIDRAW_READ_NOTE =
  "This is an Excalidraw diagram (scene outline, not editable text). Use " +
  "app__excalidraw_write to draw or update it; app__propose_edit does not apply.";

export function buildInProcessTools(deps: InProcessToolDeps): AITool[] {
  const readActiveDoc: AITool = {
    name: "app__read_active_doc",
    source: APP,
    description: "Read the full text of the document the user is currently editing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      // An open `.excalidraw` has an empty editor buffer (the canvas lives in a
      // guest frame) — serve a scene outline instead of pretending it's blank.
      const outline = await deps.getActiveExcalidrawOutline?.();
      const path = deps.getActiveDocPath();
      if (typeof outline === "string") {
        return { content: outline, kind: "excalidraw", note: EXCALIDRAW_READ_NOTE, path };
      }
      if (path?.toLowerCase().endsWith(".excalidraw")) {
        // Diagram active but no outline (frame not ready, or empty scene): the
        // note still tells the model what it's looking at — silently returning
        // "" would read as a blank text document.
        return { content: "", kind: "excalidraw", note: EXCALIDRAW_READ_NOTE, path };
      }
      return { path, content: deps.getActiveDoc() };
    },
  };

  const searchWorkspace: AITool = {
    name: "app__search_workspace",
    source: APP,
    description:
      "Search the user's workspace files (markdown/asciidoc/text) for a query string. Returns matching file paths with line numbers.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const query = String((args as { query?: unknown })?.query ?? "").trim();
      if (!query) return { matches: [], note: "empty query" };
      const root = deps.getWorkspaceRoots()[0];
      if (!root) return { matches: [], note: "no workspace open" };
      const matches = await invoke<FileMatch[]>("find_in_files", { root, query });
      return {
        matches: matches.slice(0, SEARCH_RESULT_CAP).map((m) => ({
          path: m.path,
          line: m.lineNumber,
          text: m.lineText,
        })),
        truncated: matches.length > SEARCH_RESULT_CAP,
      };
    },
  };

  const listFiles: AITool = {
    name: "app__list_files",
    source: APP,
    description: "List the files and folders in the open workspace.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const root = deps.getWorkspaceRoots()[0];
      if (!root) return { entries: [], note: "no workspace open" };
      const entries = await invoke<DirEntryLite[]>("read_dir", { path: root });
      return {
        root,
        entries: entries.map((e) => ({ name: e.name, kind: e.kind, path: e.path })),
      };
    },
  };

  const proposeEdit: AITool = {
    name: "app__propose_edit",
    source: APP,
    description:
      "Propose an edit to the ACTIVE document by replacing the first exact occurrence of `find` with `replace`. The change is NOT applied until the user approves it (Accept/Reject). Only works on the document open in the editor — for any other workspace file use app__edit_file.",
    inputSchema: {
      type: "object",
      properties: {
        find: { type: "string", description: "Exact text to locate in the document." },
        replace: { type: "string", description: "Replacement text." },
      },
      required: ["find", "replace"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const a = args as { find?: unknown; replace?: unknown };
      const find = String(a?.find ?? "");
      const replace = String(a?.replace ?? "");
      if (!find) return { status: "error", message: "`find` is required." };
      const status = await deps.proposeEdit({ find, replace });
      return { status };
    },
  };

  const writeExcalidraw: AITool = {
    name: "app__excalidraw_write",
    source: APP,
    description:
      "Draw or update a diagram in the Excalidraw canvas the user currently has open, by " +
      "providing the diagram as Mermaid text. Excalidraw renders ONLY these Mermaid diagram " +
      "types as editable shapes: flowchart, sequenceDiagram, classDiagram, and " +
      "erDiagram — prefer them. Other types (pie, gantt, state, mindmap, …) come in as a " +
      "single flat image, so avoid them. `mode` controls placement: " +
      "'replace-selection' swaps the user's current diagram selection for the new one (use " +
      "when they asked to change/fix the selected part; falls back to append if nothing is " +
      "selected); 'append' adds the diagram below existing content (the default — use to add " +
      "to the canvas); 'replace-all' clears the canvas first (only when explicitly asked to " +
      "start over). Only works when a .excalidraw file is the active document.",
    inputSchema: {
      type: "object",
      properties: {
        mermaid: {
          type: "string",
          description: "The diagram as Mermaid syntax (flowchart/sequenceDiagram/classDiagram/erDiagram).",
        },
        mode: {
          type: "string",
          enum: ["replace-selection", "append", "replace-all"],
          description: "Where to place the diagram. Defaults to 'append'.",
        },
      },
      required: ["mermaid"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const a = args as { mermaid?: unknown; mode?: unknown };
      const mermaid = String(a?.mermaid ?? "").trim();
      if (!mermaid) return { ok: false, error: "`mermaid` is required." };
      const mode: ExcalidrawApplyMode = APPLY_MODES.includes(a?.mode as ExcalidrawApplyMode)
        ? (a.mode as ExcalidrawApplyMode)
        : "append";
      return deps.applyExcalidrawMermaid({ mermaid, mode });
    },
  };

  const tools = [readActiveDoc, searchWorkspace, listFiles, proposeEdit, writeExcalidraw];

  // ── Filesystem tools (desktop only — gated on the fs bridge) ─────────────
  // Reads run automatically; create_file/create_folder declare
  // `approval: "prompt"` so the host's Accept/Reject bar gates every write
  // (read/write tiers as policy — same model the omp agent uses).
  const fs = deps.fs;
  if (fs) {
    const requireRoot = (): string | null => deps.getWorkspaceRoots()[0] ?? null;

    const readFile: AITool = {
      name: "app__read_file",
      source: APP,
      description:
        "Read a file from the open workspace by its workspace-relative path (as returned by app__list_files / app__search_workspace).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative path, e.g. 'docs/notes.md'." },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const path = String((args as { path?: unknown })?.path ?? "").trim();
        if (!path) return { status: "error", message: "`path` is required." };
        const root = requireRoot();
        if (!root) return { status: "error", message: "No workspace is open." };
        const content = await fs.readFileRelative(root, path);
        if (content === null) {
          return {
            status: "error",
            message: `File not found: ${path}. Use app__list_files or app__search_workspace to discover valid paths.`,
          };
        }
        if (content.length > READ_FILE_CAP) {
          return { content: content.slice(0, READ_FILE_CAP), path, truncated: true };
        }
        return { content, path };
      },
    };

    const createFolder: AITool = {
      name: "app__create_folder",
      source: APP,
      approval: "prompt",
      description:
        "Create a folder (and any missing parents) at a workspace-relative path. The user approves each call.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative folder path, e.g. 'notes/drafts'." },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const path = String((args as { path?: unknown })?.path ?? "").trim();
        if (!path) return { status: "error", message: "`path` is required." };
        const root = requireRoot();
        if (!root) return { status: "error", message: "No workspace is open." };
        try {
          await fs.createDir(root, path);
          return { status: "created", path };
        } catch (err) {
          return { status: "error", message: creationErrorMessage(err, path) };
        }
      },
    };

    const createFile: AITool = {
      name: "app__create_file",
      source: APP,
      approval: "prompt",
      description:
        "Create a NEW file at a workspace-relative path, optionally with initial content. Refuses to overwrite an existing file — to change one, use app__propose_edit on the active document instead. The user approves each call.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Initial file content. Defaults to empty." },
          path: { type: "string", description: "Workspace-relative file path, e.g. 'notes/ideas.md'." },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const a = args as { content?: unknown; path?: unknown };
        const path = String(a?.path ?? "").trim();
        if (!path) return { status: "error", message: "`path` is required." };
        const root = requireRoot();
        if (!root) return { status: "error", message: "No workspace is open." };
        try {
          await fs.createFile(root, path);
        } catch (err) {
          return { status: "error", message: creationErrorMessage(err, path) };
        }
        const content = typeof a?.content === "string" ? a.content : "";
        if (content) {
          // create_file validated the path against the root; writing through
          // the joined absolute path reuses that vetted location.
          await fs.writeFileAbs(`${root}/${path}`, content);
        }
        return { status: "created", path, bytes: content.length };
      },
    };

    const editFile: AITool = {
      name: "app__edit_file",
      source: APP,
      approval: "prompt",
      description:
        "Edit ANY workspace file by replacing an exact occurrence of `find` with `replace`. Read the file first (app__read_file) and copy `find` exactly — whitespace included. Use `all: true` to replace every occurrence. The user approves each call.",
      inputSchema: {
        type: "object",
        properties: {
          all: { type: "boolean", description: "Replace every occurrence (default: only the first, which must be unique)." },
          find: { type: "string", description: "Exact text to locate in the file." },
          path: { type: "string", description: "Workspace-relative file path." },
          replace: { type: "string", description: "Replacement text." },
        },
        required: ["find", "path", "replace"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const a = args as { all?: unknown; find?: unknown; path?: unknown; replace?: unknown };
        const path = String(a?.path ?? "").trim();
        const find = typeof a?.find === "string" ? a.find : "";
        const replace = typeof a?.replace === "string" ? a.replace : "";
        if (!path || !find) return { status: "error", message: "`path` and `find` are required." };
        const root = requireRoot();
        if (!root) return { status: "error", message: "No workspace is open." };
        const content = await fs.readFileRelative(root, path);
        if (content === null) {
          return {
            status: "error",
            message: `File not found: ${path}. Use app__list_files to discover valid paths, or app__create_file for a new file.`,
          };
        }
        const occurrences = content.split(find).length - 1;
        if (occurrences === 0) {
          // Instructional no-match (omp-style): point at a near miss when one
          // exists so the model fixes its `find` instead of flailing.
          const fuzzyAt = content.toLowerCase().indexOf(find.toLowerCase());
          const hint =
            fuzzyAt >= 0
              ? ` A similar passage exists at line ${content.slice(0, fuzzyAt).split("\n").length} but differs in casing or whitespace — re-read the file with app__read_file and copy it exactly.`
              : " Re-read the file with app__read_file and copy the text exactly.";
          return { status: "error", message: `No occurrence of \`find\` in ${path}.${hint}` };
        }
        if (occurrences > 1 && a?.all !== true) {
          return {
            status: "error",
            message: `\`find\` matches ${occurrences} places in ${path}. Add more surrounding lines to make it unique, or pass all: true to replace every occurrence.`,
          };
        }
        const next =
          a?.all === true
            ? content.split(find).join(replace)
            : content.replace(find, replace);
        await fs.writeFileAbs(`${root}/${path}`, next);
        return { path, replacements: a?.all === true ? occurrences : 1, status: "edited" };
      },
    };

    tools.push(readFile, createFolder, createFile, editFile);
  }

  return tools;
}

/** Cap for app__read_file so a huge file can't blow the model's context. */
const READ_FILE_CAP = 50_000;

/** Instructional error text (the model reads this — tell it what to do next). */
function creationErrorMessage(err: unknown, path: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/exists/i.test(raw)) {
    return `${path} already exists — pick a different name, or read it first if you meant to build on it.`;
  }
  if (/invalid path/i.test(raw)) {
    return `Invalid path: ${path}. Use a relative path inside the workspace (no '..' or absolute paths).`;
  }
  return raw;
}
