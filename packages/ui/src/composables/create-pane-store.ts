import { createSignal, type Setter } from "solid-js";
import type { FSEntry } from "@asciimark/core/types.ts";
import type { Frontmatter } from "@asciimark/core/frontmatter.ts";
import { migrateLegacyTabSession } from "@asciimark/core/tabs.ts";
import { createTabStore, type TabStore } from "./create-tab-store.ts";

export type EditorMode = "edit" | "split" | "preview";

/**
 * The slice of viewer state that lives per-pane: which file is loaded,
 * the editor and converted-HTML content, the editor mode, and the
 * loading flag. Workspace data (roots, recents, theme, fonts) stays
 * outside on `AppState` because there's only one workspace tree at a
 * time. The TabStore composes on top of this slice — it's bundled
 * into the PaneStore so each pane carries its own tab list (see
 * `createPaneStore` below).
 */
export interface PaneViewSlice {
  editorContent: () => string;
  setEditorContent: Setter<string>;

  savedContent: () => string;
  setSavedContent: Setter<string>;

  html: () => string;
  setHtml: Setter<string>;

  frontmatter: () => Frontmatter | null;
  setFrontmatter: Setter<Frontmatter | null>;

  editorMode: () => EditorMode;
  setEditorMode: Setter<EditorMode>;

  selectedFile: () => FSEntry | null;
  setSelectedFile: Setter<FSEntry | null>;

  selectedRootId: () => string | null;
  setSelectedRootId: Setter<string | null>;

  loading: () => boolean;
  setLoading: Setter<boolean>;
}

export interface PaneStore extends PaneViewSlice {
  paneId: string;
  /** TabStore scoped to this pane. Each pane has its own tab list,
   *  active tab, and closed-tabs LIFO. */
  tabs: TabStore;
}

/**
 * Build a fresh `PaneStore` with empty content and an attached
 * TabStore. The TabStore captures the slice's setters at creation
 * time so its snapshot/restore writes back to THIS pane's signals.
 */
export function createPaneStore(paneId: string): PaneStore {
  const [editorContent, setEditorContent] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [html, setHtml] = createSignal("");
  const [frontmatter, setFrontmatter] = createSignal<Frontmatter | null>(null);
  const [editorMode, setEditorMode] = createSignal<EditorMode>("preview");
  const [selectedFile, setSelectedFile] = createSignal<FSEntry | null>(null);
  const [selectedRootId, setSelectedRootId] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const slice: PaneViewSlice = {
    editorContent,
    setEditorContent,
    savedContent,
    setSavedContent,
    html,
    setHtml,
    frontmatter,
    setFrontmatter,
    editorMode,
    setEditorMode,
    selectedFile,
    setSelectedFile,
    selectedRootId,
    setSelectedRootId,
    loading,
    setLoading,
  };

  // Each pane gets its own localStorage slot so two panes can save
  // independent tab lists. The first pane (paneId="pane-0") also
  // absorbs any session left by an older single-pane build via
  // `migrateLegacyTabSession` — idempotent and harmless when there
  // is nothing to migrate.
  const storageKey = `asciimark-tab-session-${paneId}`;
  if (paneId === "pane-0") {
    migrateLegacyTabSession(storageKey);
  }

  const tabs = createTabStore({ pane: slice, storageKey });

  return {
    paneId,
    ...slice,
    tabs,
  };
}
