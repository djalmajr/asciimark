import { Show, createEffect, createMemo, createSignal, type JSX } from "solid-js";
import type { FSEntry } from "@asciimark/core/types.ts";
import type { RecentFile } from "@asciimark/core/recent-files.ts";
import { flattenWorkspace, type IndexedFile } from "@asciimark/core/file-index.ts";
import type { AppState } from "../composables/create-app-state.ts";
import type { TabStore } from "../composables/create-tab-store.ts";
import { AppProvider } from "../context/app-context.tsx";
import { Toolbar } from "./toolbar.tsx";
import { TabBar } from "./tab-bar.tsx";
import { ContentToolbar } from "./content-toolbar.tsx";
import { EditorToolbar } from "./editor-toolbar.tsx";
import { FileTree } from "./file-tree.tsx";
import { Preview } from "./preview.tsx";
import { Editor } from "./editor.tsx";
import { EmptyState } from "./empty-state.tsx";
import { Toaster } from "./ui/toast.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { QuickOpen } from "./quick-open.tsx";
import { ShortcutsHelp } from "./shortcuts-help.tsx";
import { CommandPalette } from "./command-palette.tsx";
import type { Command } from "@asciimark/core/command-palette.ts";
import { SymbolPalette } from "./symbol-palette.tsx";
import { extractHeadings, type Heading } from "@asciimark/core/headings.ts";
import { FindInFiles, type FileMatch, type MatchSelection } from "./find-in-files.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import IconCheck from "~icons/lucide/check";
import IconSlidersHorizontal from "~icons/lucide/sliders-horizontal";

interface AppShellProps {
  state: AppState;

  // Platform-specific booleans (as accessors for reactivity)
  hasRoot: boolean;
  showRecentHistory?: boolean;
  showEditorTabs: boolean;
  showNavButtons: boolean;
  showToolbar: boolean;
  showPdfExport?: boolean;
  showSidebar: boolean;
  /**
   * Flag indicating the app is drawing its own caption buttons in the
   * top-right (currently Windows with `decorations: false`). Used to
   * route the toolbar controls to the left so they don't overlap.
   * The actual caption button component is rendered by the host app,
   * since it depends on Tauri APIs not available in packages/ui.
   */
  showWindowControls?: boolean;
  windowFrameToolbar?: boolean;

  // Platform-derived toolbar strings
  toolbarFilePath: string | null;
  toolbarRootName: string;

  // Platform callbacks
  /**
   * Trigger a manual app-update check. Only desktop wires this; web/extension
   * leave it undefined and the menu item is hidden.
   */
  onCheckForUpdates?: () => void;
  onCloseRoot?: (rootId: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onLoadFile: (entry: FSEntry, rootId: string) => void;
  onOpenInNewTab?: (entry: FSEntry, rootId: string) => void;
  onDoubleClickFile?: (entry: FSEntry, rootId: string) => void;
  onNavigate: (path: string, fragment?: string | null) => void;
  onOpenExternal?: (url: string) => void;
  onOpenFolder?: () => void;
  onOpenRecentFile?: (recentFile: RecentFile) => void | Promise<void>;
  onOpenRecentFolder?: (path: string) => void | Promise<void>;
  /**
   * Copy the absolute filesystem path of a tree entry. Platforms with
   * filesystem access (desktop) pass this; the file tree falls back to
   * copying the workspace-relative path when omitted.
   */
  onCopyPath?: (entry: FSEntry, rootId: string) => void | Promise<void>;
  /**
   * Rename a file or directory. Only platforms with write access (desktop)
   * pass this; if absent, the file tree hides the Rename menu item.
   */
  onRename?: (entry: FSEntry, rootId: string, newName: string) => Promise<void>;
  onDelete?: (entry: FSEntry, rootId: string) => Promise<void>;
  /**
   * Resolve an `<img>` src in the rendered document. Desktop maps relative
   * paths to Tauri asset URLs so the webview can load files from disk.
   */
  resolveImageSrc?: (src: string) => string | null;
  onToggleShowHiddenEntries?: (enabled: boolean) => void | Promise<void>;
  /**
   * Force-reload a single workspace root from disk. Optional — currently
   * wired by the extension to recover from stale handles after a permission
   * regrant. Desktop relies on the watcher and does not pass this.
   */
  onRefreshRoot?: (rootId: string) => void | Promise<void>;
  onReorderRoots?: (newOrder: string[]) => void;
  tabStore?: TabStore;
  onActivateTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onNewTab?: () => void;
  onWindowDragStart?: () => void | Promise<void>;
  onWindowTitleDoubleClick?: () => void | Promise<void>;

  /**
   * Quick Open (Cmd/Ctrl+P) overlay state. The host owns the open/closed
   * boolean and the recents set so platforms without a recents store can
   * keep the overlay working without changes here.
   */
  quickOpenOpen?: boolean;
  quickOpenRecents?: ReadonlySet<string>;
  onQuickOpenSelect?: (file: IndexedFile) => void;
  onQuickOpenClose?: () => void;

  /** Shortcuts help (Cmd/Ctrl+/) modal state. Host-owned for the same
   *  reason as Quick Open. */
  shortcutsHelpOpen?: boolean;
  onShortcutsHelpClose?: () => void;
  /** Toolbar fires this when the user picks "Keyboard shortcuts" from the
   *  hamburger menu. AppShell flips the host's open signal via this. */
  onShortcutsHelpOpen?: () => void;

  /** Command palette (Cmd/Ctrl+Shift+P). Same host-owned pattern. The
   *  catalog is built by the host because the side-effects bound to
   *  each command (open dialog, invoke IPC, mutate signals) are
   *  host-only. */
  commandPaletteOpen?: boolean;
  commandCatalog?: readonly Command[];
  onCommandPaletteClose?: () => void;

  /** Go-to-Symbol palette (Cmd/Ctrl+Shift+O). AppShell extracts headings
   *  from the active file's editor content; the host only owns the
   *  open/close toggle. */
  symbolPaletteOpen?: boolean;
  onSymbolPaletteClose?: () => void;

  /** Find in Files (Cmd/Ctrl+Shift+F). AppShell renders the modal; the
   *  host provides the search function (typically the IPC client) and
   *  the close handler. The id of the active root is read from the
   *  current state so the host doesn't have to thread it. */
  findInFilesOpen?: boolean;
  findInFilesSearch?: (
    rootId: string,
    query: string,
    options: { caseSensitive: boolean },
  ) => Promise<FileMatch[]>;
  onFindInFilesClose?: () => void;

  // Platform-specific content (extension: FileAccessWarning wrapper)
  contentWrapper?: (content: JSX.Element) => JSX.Element;

  // DnD (extension uses DOM events, desktop uses Tauri native)
  onDragLeave?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}

export function AppShell(props: AppShellProps) {
  let tocContainerRef: HTMLDivElement | undefined;
  let tocPanelRef: HTMLElement | undefined;
  let appRef: HTMLDivElement | undefined;
  let mainRef: HTMLDivElement | undefined;
  let previewPanelRef: HTMLDivElement | undefined;

  // Wire tocPanelRef for state methods that need it
  const s = props.state;
  const [editorUndoTrigger, setEditorUndoTrigger] = createSignal(0);
  const [editorRedoTrigger, setEditorRedoTrigger] = createSignal(0);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [editorSyncTargetRatio, setEditorSyncTargetRatio] = createSignal<number | null>(null);
  const [editorSyncTargetVersion, setEditorSyncTargetVersion] = createSignal(0);
  // Go-to-Symbol target line + version. The Editor watches `version` for
  // changes (so the same line can be jumped to twice in a row).
  const [editorScrollToLine, setEditorScrollToLine] = createSignal<number | null>(null);
  const [editorScrollToLineVersion, setEditorScrollToLineVersion] = createSignal(0);
  const [previewSyncTargetRatio, setPreviewSyncTargetRatio] = createSignal<number | null>(null);
  const [previewSyncTargetVersion, setPreviewSyncTargetVersion] = createSignal(0);

  const syncScrollActive = () => s.editorMode() === "split" && s.syncScroll() && !!s.selectedFile();

  createEffect(() => {
    if (syncScrollActive()) return;
    setEditorSyncTargetRatio(null);
    setPreviewSyncTargetRatio(null);
  });

  function setTocExpanded(expanded: boolean) {
    if (!tocContainerRef) return;
    const items = tocContainerRef.querySelectorAll<HTMLLIElement>("#toc li.toc-collapsible");
    for (const item of items) {
      item.classList.toggle("toc-expanded", expanded);
      item.classList.toggle("toc-collapsed", !expanded);
      const toggle = item.querySelector<HTMLElement>(":scope > .toc-toggle");
      if (toggle) {
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      }
    }
  }

  const defaultContent = () => (
    <Show
      when={s.selectedFile()}
      fallback={
        <EmptyState
          favorites={s.favorites()}
          hasRoot={props.hasRoot}
          onOpenFolder={props.onOpenFolder}
          onOpenRecentFile={props.onOpenRecentFile}
          onOpenRecentFolder={props.onOpenRecentFolder}
          onClearRecentHistory={s.handleClearRecentHistory}
          onRemoveRecentFile={s.handleRemoveRecentFile}
          onRemoveRecentFolder={s.handleRemoveRecentFolder}
          onToggleFavorite={s.handleToggleFavorite}
          onWindowDragStart={props.onWindowDragStart}
          recentFiles={s.recentFiles()}
          recentFolders={s.recentFolders()}
          showRecentHistory={!!props.showRecentHistory}
        />
      }
    >
      <Preview
        findTrigger={s.previewFindTrigger()}
        html={s.html()}
        frontmatter={s.frontmatter()}
        resolveImageSrc={props.resolveImageSrc}
        loading={s.loading()}
        searchOpen={s.previewSearchOpen()}
        syncScrollActive={syncScrollActive()}
        syncScrollTargetRatio={previewSyncTargetRatio()}
        syncScrollTargetVersion={previewSyncTargetVersion()}
        tocVisible={s.tocVisible()}
        tocContainer={tocContainerRef}
        currentFilePath={s.selectedFile()?.path ?? null}
        pendingFragment={s.pendingFragment()}
        previewOverlayHost={previewPanelRef}
        onScrollRatioChange={(ratio) => {
          if (!syncScrollActive()) return;
          setEditorSyncTargetRatio(ratio);
          setEditorSyncTargetVersion((value) => value + 1);
        }}
        onFragmentHandled={() => s.setPendingFragment(null)}
        onNavigate={props.onNavigate}
        onOpenExternal={props.onOpenExternal}
        onSearchOpenChange={s.setPreviewSearchOpen}
        onTocChange={(has) => s.setHasToc(has)}
      />
    </Show>
  );

  // Lazily flatten the workspace only while the Quick Open overlay is open.
  // `state.rootsList` is reactive, so the memo refreshes when files are
  // added or roots change underneath an open overlay.
  const quickOpenFiles = createMemo<IndexedFile[]>(() => {
    if (!props.quickOpenOpen) return [];
    return flattenWorkspace(s.rootsList());
  });

  // Symbol palette source: parse headings from the active file's editor
  // content, dispatched by extension. Computed lazily — only when the
  // overlay is open. Falls back to empty when no file is selected.
  const symbolHeadings = createMemo<Heading[]>(() => {
    if (!props.symbolPaletteOpen) return [];
    const file = s.selectedFile();
    if (!file) return [];
    return extractHeadings(file.path, s.editorContent());
  });

  // Find-in-Files match selected → open the file via the host's
  // `onLoadFile` and bump the editor's scrollToLine so the line is
  // centered. The bump is deferred a microtask to give Solid time to
  // flush the file load (which includes a fetch + convert pass) before
  // the editor receives the new content.
  function handleFindInFilesSelect(selection: MatchSelection) {
    const entry = s.findEntryByPath(selection.path, selection.rootId);
    if (entry && entry.kind === "file") {
      props.onLoadFile(entry, selection.rootId);
      // Wait two ticks so the editor receives the new doc, then jump.
      queueMicrotask(() => {
        setTimeout(() => {
          setEditorScrollToLine(selection.line);
          setEditorScrollToLineVersion((v) => v + 1);
        }, 0);
      });
    }
    props.onFindInFilesClose?.();
  }

  return (
    <AppProvider state={props.state}>
      <Toaster />
      <ConfirmDialog />
      <QuickOpen
        open={!!props.quickOpenOpen}
        files={quickOpenFiles()}
        recents={props.quickOpenRecents}
        onSelect={(file) => props.onQuickOpenSelect?.(file)}
        onClose={() => props.onQuickOpenClose?.()}
      />
      <ShortcutsHelp
        open={!!props.shortcutsHelpOpen}
        onClose={() => props.onShortcutsHelpClose?.()}
      />
      <CommandPalette
        open={!!props.commandPaletteOpen}
        commands={props.commandCatalog ?? []}
        onClose={() => props.onCommandPaletteClose?.()}
      />
      <SymbolPalette
        open={!!props.symbolPaletteOpen}
        headings={symbolHeadings()}
        onSelect={(heading) => {
          // Jump the editor to the heading line. Bumping `version`
          // forces the createEffect inside the Editor to dispatch even
          // when the same line is jumped to twice in a row.
          setEditorScrollToLine(heading.line);
          setEditorScrollToLineVersion((v) => v + 1);
          props.onSymbolPaletteClose?.();
        }}
        onClose={() => props.onSymbolPaletteClose?.()}
      />
      <FindInFiles
        open={!!props.findInFilesOpen}
        rootId={s.selectedRootId()}
        search={props.findInFilesSearch ?? (() => Promise.resolve([]))}
        onSelect={handleFindInFilesSelect}
        onClose={() => props.onFindInFilesClose?.()}
      />
      <div
        class="app"
        classList={{
          "drag-over": s.dragOver(),
          "window-frame-toolbar": !!props.windowFrameToolbar,
        }}
        ref={appRef}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onDrop={props.onDrop}
      >
        <Show when={props.showToolbar}>
          <Toolbar
            canGoBack={s.canGoBack()}
            canGoForward={s.canGoForward()}
            darkMode={s.darkMode()}
            editorMode={s.editorMode()}
            hasFile={s.hasFile()}
            hasRoot={props.hasRoot}
            onCheckForUpdates={props.onCheckForUpdates}
            onShortcutsHelp={props.onShortcutsHelpOpen}
            supportsPreview={s.previewSupported()}
            inWindowFrame={!!props.windowFrameToolbar}
            controlsOnLeft={!!props.showWindowControls}
            recentFiles={s.recentFiles()}
            recentFolders={s.recentFolders()}
            showEditorTabs={props.showEditorTabs}
            showNavButtons={props.showNavButtons}
            showRecentHistory={!!props.showRecentHistory}
            sidebarVisible={s.sidebarVisible()}
            themeMode={s.themeMode()}
            tocVisible={s.tocVisible()}
            onEditorModeChange={(m) => s.setEditorMode(m)}
            onExportPdf={props.showPdfExport !== false ? s.handleExportPdf : undefined}
            onGoBack={props.onGoBack}
            onGoForward={props.onGoForward}
            onOpenFolder={props.onOpenFolder}
            onOpenRecentFile={props.onOpenRecentFile}
            onOpenRecentFolder={props.onOpenRecentFolder}
            onThemeChange={s.handleThemeChange}
            onToggleSidebar={() => s.setSidebarVisible((v) => !v)}
            onToggleToc={() => s.setTocVisible((v) => !v)}
            onWindowDragStart={props.onWindowDragStart}
            onWindowTitleDoubleClick={props.onWindowTitleDoubleClick}
          />
        </Show>
        <div class="main" ref={mainRef}>
          <Show when={props.showSidebar}>
            <aside class="sidebar" style={{ width: `${s.sidebarWidth()}px` }}>
              <FileTree
                roots={s.rootsList()}
                selectedPath={s.selectedFile()?.path ?? null}
                selectedRootId={s.selectedRootId()}
                showHiddenEntries={s.showHiddenEntries()}
                showAllDirs={s.showAllDirs()}
                showAllFiles={s.showAllFiles()}
                onCloseRoot={props.onCloseRoot}
                onCopyPath={props.onCopyPath}
                onRename={props.onRename}
                onDelete={props.onDelete}
                onReorderRoots={props.onReorderRoots}
                onSelect={(entry, rootId) => props.onLoadFile(entry, rootId)}
                onOpenInNewTab={props.onOpenInNewTab}
                onDoubleClickFile={props.onDoubleClickFile}
                onToggleRootCollapsed={(id) => s.toggleRootCollapsed(id)}
                onToggleShowHiddenEntries={props.onToggleShowHiddenEntries
                  ? () => {
                    const next = !s.showHiddenEntries();
                    s.setShowHiddenEntries(next);
                    void props.onToggleShowHiddenEntries?.(next);
                  }
                  : undefined}
                onToggleShowAllDirs={() => s.setShowAllDirs((v) => !v)}
                onToggleShowAllFiles={() => s.setShowAllFiles((v) => !v)}
              />
            </aside>
            <div class="resize-handle" onDblClick={s.onResizeReset} onMouseDown={(e) => s.onResizeStart(e, appRef)} />
          </Show>
          <div class="content-area">
            <Show when={props.tabStore && props.tabStore.tabs().length > 0}>
              <TabBar
                tabStore={props.tabStore!}
                activeTabDirty={s.isDirty()}
                onActivateTab={props.onActivateTab ?? (() => {})}
                onCloseTab={props.onCloseTab ?? (() => {})}
                onNewTab={props.onNewTab}
              />
            </Show>
            <div class="content-panels">
              <Show when={s.editorMode() !== "preview" && s.selectedFile()}>
                <div
                  class="editor-panel"
                  style={s.editorMode() === "split" ? { flex: s.editorWidth() } : { flex: 1 }}
                >
                  <Show when={props.showToolbar}>
                    <EditorToolbar
                      canRedo={canRedo()}
                      canUndo={canUndo()}
                      showInvisibles={s.showInvisibles()}
                      showLineNumbers={s.showLineNumbers()}
                      indentMode={s.indentMode()}
                      indentSize={s.indentSize()}
                      syncScroll={s.syncScroll()}
                      wrapText={s.wrapText()}
                      onRedo={() => setEditorRedoTrigger((value) => value + 1)}
                      searchOpen={s.editorSearchOpen()}
                      onToggleFind={() => s.setEditorSearchOpen((value) => !value)}
                      onUndo={() => setEditorUndoTrigger((value) => value + 1)}
                      onIndentChange={(mode, size) => {
                        s.handleIndentModeChange(mode);
                        s.handleIndentSizeChange(size);
                      }}
                      onToggleShowInvisibles={() => s.handleShowInvisiblesChange(!s.showInvisibles())}
                      onToggleShowLineNumbers={() => s.handleLineNumbersChange(!s.showLineNumbers())}
                      onToggleSyncScroll={() => s.handleSyncScrollChange(!s.syncScroll())}
                      onToggleWrapText={() => s.handleWrapTextChange(!s.wrapText())}
                    />
                  </Show>
                  <Editor
                    content={s.savedContent()}
                    darkMode={s.darkMode()}
                    findTrigger={s.editorFindTrigger()}
                    indentMode={s.indentMode()}
                    indentSize={s.indentSize()}
                    showInvisibles={s.showInvisibles()}
                    showLineNumbers={s.showLineNumbers()}
                    wrapText={s.wrapText()}
                    syncScrollActive={syncScrollActive()}
                    syncScrollTargetRatio={editorSyncTargetRatio()}
                    syncScrollTargetVersion={editorSyncTargetVersion()}
                    scrollToLine={editorScrollToLine()}
                    scrollToLineVersion={editorScrollToLineVersion()}
                    redoTrigger={editorRedoTrigger()}
                    searchOpen={s.editorSearchOpen()}
                    undoTrigger={editorUndoTrigger()}
                    onScrollRatioChange={(ratio) => {
                      if (!syncScrollActive()) return;
                      setPreviewSyncTargetRatio(ratio);
                      setPreviewSyncTargetVersion((value) => value + 1);
                    }}
                    onChange={(content) => {
                      const entry = s.selectedFile();
                      if (entry) {
                        s.debouncedConvert(content, entry.path, s._readFile ?? (() => Promise.resolve(null)));
                      }
                    }}
                    onHistoryStateChange={(historyState) => {
                      setCanUndo(historyState.canUndo);
                      setCanRedo(historyState.canRedo);
                    }}
                    onSearchOpenChange={s.setEditorSearchOpen}
                  />
                </div>
              </Show>
              <Show when={s.editorMode() === "split" && s.selectedFile()}>
                <div
                  class="resize-handle"
                  onDblClick={s.onEditorResizeReset}
                  onMouseDown={(e) => s.onEditorResizeStart(e, mainRef, appRef)}
                />
              </Show>
              <Show when={s.editorMode() !== "edit"}>
                <div
                  class="preview-panel"
                  ref={previewPanelRef}
                  style={s.editorMode() === "split" ? { flex: 100 - s.editorWidth() } : undefined}
                >
                  <Show when={props.showToolbar && s.hasFile()}>
                    <ContentToolbar
                      autoRefresh={s.autoRefresh()}
                      fontFamilies={s.FontFamilies}
                      fontPrefs={s.fontPrefs()}
                      fontSizes={s.FontSizes}
                      onFind={s.triggerPreviewFind}
                      searchOpen={s.previewSearchOpen()}
                      onToggleFind={() => s.setPreviewSearchOpen((value) => !value)}
                      onFontPrefsChange={s.handleFontPrefsChange}
                      onToggleAutoRefresh={() => s.setAutoRefresh((v) => !v)}
                    />
                  </Show>
                  <div class="content">
                    {props.contentWrapper
                      ? props.contentWrapper(defaultContent())
                      : defaultContent()
                    }
                  </div>
                </div>
              </Show>
            </div>
          </div>
          <aside
            class="toc-panel"
            classList={{ "toc-hidden": s.editorMode() === "edit" || !s.tocVisible() || !s.hasFile() || !s.hasToc() }}
            data-toc-levels={s.tocLevels()}
            ref={tocPanelRef}
          >
            <div class="toc-panel-header">
              <span class="toc-panel-title">Table of Contents</span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  as="button"
                  class="toc-panel-options"
                  aria-label="TOC options"
                  title="TOC options"
                >
                  <IconSlidersHorizontal width={16} height={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setTocExpanded(true)}>
                    Expand All
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTocExpanded(false)}>
                    Collapse All
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => s.setTocLevels(1)}>
                    <span class="flex-1">Show 1 Level</span>
                    <Show when={s.tocLevels() === 1}>
                      <IconCheck width={14} height={14} />
                    </Show>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => s.setTocLevels(2)}>
                    <span class="flex-1">Show 2 Levels</span>
                    <Show when={s.tocLevels() === 2}>
                      <IconCheck width={14} height={14} />
                    </Show>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => s.setTocLevels(3)}>
                    <span class="flex-1">Show 3 Levels</span>
                    <Show when={s.tocLevels() === 3}>
                      <IconCheck width={14} height={14} />
                    </Show>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => s.setTocLevels(4)}>
                    <span class="flex-1">Show 4 Levels</span>
                    <Show when={s.tocLevels() === 4}>
                      <IconCheck width={14} height={14} />
                    </Show>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div class="toc-panel-content" ref={tocContainerRef} />
          </aside>
        </div>
        <Show when={props.showToolbar && (props.toolbarRootName || props.toolbarFilePath)}>
          <footer class="status-bar no-print">
            <span class="status-breadcrumb">
              <Show when={props.toolbarRootName}>
                <span class="status-root">{props.toolbarRootName}</span>
              </Show>
              <Show when={props.toolbarFilePath}>
                <Show when={props.toolbarRootName}>
                  <span class="status-sep">/</span>
                </Show>
                <span class="status-file">{props.toolbarFilePath}</span>
              </Show>
            </span>
          </footer>
        </Show>
      </div>
    </AppProvider>
  );
}
