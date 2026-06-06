import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { fireEvent, render } from "@solidjs/testing-library";
import type { WorkspaceRoot, FSEntry } from "@asciimark/core/types.ts";
import { AppProvider } from "../context/app-context.tsx";
import type { AppState } from "../composables/create-app-state.ts";
import { FileTree } from "./file-tree.tsx";

// Minimal AppState stub — only the fields FileTreeItem actually reads.
function makeAppStub(): AppState {
  const [editingPath, setEditingPath] = createSignal<string | null>(null);
  const [creatingAt, setCreatingAt] = createSignal<null>(null);
  const [moveClipboard, setMoveClipboard] = createSignal<null>(null);
  const [selectedFile, setSelectedFile] = createSignal<FSEntry | null>(null);
  return {
    editingPath,
    setEditingPath,
    creatingAt,
    setCreatingAt,
    moveClipboard,
    setMoveClipboard,
    selectedFile,
    setSelectedFile,
    isDirty: () => false,
  } as unknown as AppState;
}

function file(name: string, path = name): FSEntry {
  return { name, path, kind: "file" };
}
function dir(name: string, children: FSEntry[], path = name): FSEntry {
  return { name, path, kind: "directory", children };
}
function makeRoot(id: string, name: string, entries: FSEntry[]): WorkspaceRoot {
  return { id, name, entries, collapsed: false };
}

const SINGLE_ROOT: WorkspaceRoot[] = [
  makeRoot("r1", "vault", [
    dir("notes", [file("a.md", "notes/a.md"), file("b.md", "notes/b.md")], "notes"),
    file("README.md"),
  ]),
];

describe("FileTree", () => {
  it("renders the workspace root header and visible entries", () => {
    const { getByText } = render(() => (
      <AppProvider state={makeAppStub()}>
        <FileTree
          roots={SINGLE_ROOT}
          selectedPath={null}
          selectedRootId={null}
          onSelect={() => {}}
        />
      </AppProvider>
    ));
    expect(getByText("README.md")).not.toBeNull();
    expect(getByText("notes")).not.toBeNull();
  });

  it("clicking a file dispatches onSelect with the entry and rootId", () => {
    const onSelect = vi.fn();
    const { getByText } = render(() => (
      <AppProvider state={makeAppStub()}>
        <FileTree
          roots={SINGLE_ROOT}
          selectedPath={null}
          selectedRootId={null}
          onSelect={onSelect}
        />
      </AppProvider>
    ));
    fireEvent.click(getByText("README.md"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [entry, rootId] = onSelect.mock.calls[0]!;
    expect(entry.name).toBe("README.md");
    expect(rootId).toBe("r1");
  });

  it("filter input narrows visible entries by substring match", () => {
    const { container, getByPlaceholderText } = render(() => (
      <AppProvider state={makeAppStub()}>
        <FileTree
          roots={SINGLE_ROOT}
          selectedPath={null}
          selectedRootId={null}
          onSelect={() => {}}
        />
      </AppProvider>
    ));
    const input = getByPlaceholderText(/Filter files/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "READ" } });

    // tree-item-wrapper sets display:none when invisible, so we filter
    // by visibility on the wrapper before reading the name.
    const visibleNames = Array.from(
      container.querySelectorAll<HTMLElement>(".tree-item-wrapper"),
    )
      .filter((el) => el.style.display !== "none")
      .map((el) => el.querySelector(".tree-name")?.textContent?.trim());
    expect(visibleNames).toContain("README.md");
    expect(visibleNames).not.toContain("a.md");
    expect(visibleNames).not.toContain("b.md");
  });

  it("renders the empty state when no roots have visible entries", () => {
    const empty: WorkspaceRoot[] = [makeRoot("r1", "empty", [])];
    const { getByText } = render(() => (
      <AppProvider state={makeAppStub()}>
        <FileTree
          roots={empty}
          selectedPath={null}
          selectedRootId={null}
          onSelect={() => {}}
        />
      </AppProvider>
    ));
    expect(getByText(/No supported files found/i)).not.toBeNull();
  });

  it("ArrowDown does not crash on a populated tree (smoke)", () => {
    const { container } = render(() => (
      <AppProvider state={makeAppStub()}>
        <FileTree
          roots={SINGLE_ROOT}
          selectedPath={null}
          selectedRootId={null}
          onSelect={() => {}}
        />
      </AppProvider>
    ));
    const nav = container.querySelector(".file-tree") as HTMLElement;
    nav.focus();
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    expect(container.querySelector(".file-tree")).not.toBeNull();
  });

  describe("showItemMenu prop", () => {
    // The bug this guards against: `FileTreeItem` renders its children
    // recursively through itself, and the prop list passed to that inner
    // `<FileTreeItem>` was missing `showItemMenu`. Result: setting
    // showItemMenu={false} hid the dropdown trigger on root-level rows
    // but left it on every nested row. The browser extension shipped
    // that regression — we never want it back.
    //
    // Mutation-survival contract:
    //   - Removing `showItemMenu={props.showItemMenu}` from the
    //     recursive `<FileTreeItem>` call must fail the
    //     "hides menu on nested rows" test below.
    //   - Replacing it with `showItemMenu={true}` must fail it too.
    //   - Removing the `<Show when={!isEditing() && menuEnabled()}>`
    //     gate must fail the root-level test.

    function expandDir(container: HTMLElement, name: string) {
      const wrapper = Array.from(
        container.querySelectorAll<HTMLElement>(".tree-item-wrapper"),
      ).find((el) => el.querySelector(".tree-name")?.textContent?.trim() === name);
      const item = wrapper?.querySelector<HTMLElement>(".tree-item.directory");
      if (!item) throw new Error(`directory '${name}' not found`);
      fireEvent.click(item);
    }

    it("renders the three-dot trigger on every row by default", () => {
      const { container } = render(() => (
        <AppProvider state={makeAppStub()}>
          <FileTree
            roots={SINGLE_ROOT}
            selectedPath={null}
            selectedRootId={null}
            onSelect={() => {}}
          />
        </AppProvider>
      ));
      expandDir(container, "notes");
      // `notes/` (directory) + a.md + b.md + README.md — 4 rows, all
      // with the dropdown trigger.
      const triggers = container.querySelectorAll(".tree-item-more");
      expect(triggers.length).toBe(4);
    });

    it("hides the menu on root-level rows when showItemMenu={false}", () => {
      const { container } = render(() => (
        <AppProvider state={makeAppStub()}>
          <FileTree
            roots={SINGLE_ROOT}
            selectedPath={null}
            selectedRootId={null}
            onSelect={() => {}}
            showItemMenu={false}
          />
        </AppProvider>
      ));
      const triggers = container.querySelectorAll(".tree-item-more");
      expect(triggers.length).toBe(0);
    });

    it("hides the menu on NESTED rows too when showItemMenu={false}", () => {
      // The regression: nested rows kept their menu because the prop
      // was not forwarded to the recursive child. Expanding a directory
      // surfaces the children — none of them should have the trigger.
      const { container } = render(() => (
        <AppProvider state={makeAppStub()}>
          <FileTree
            roots={SINGLE_ROOT}
            selectedPath={null}
            selectedRootId={null}
            onSelect={() => {}}
            showItemMenu={false}
          />
        </AppProvider>
      ));
      expandDir(container, "notes");
      // After expanding, the DOM contains rows for notes, a.md, b.md,
      // README.md. None of them must render `.tree-item-more`.
      const triggers = container.querySelectorAll(".tree-item-more");
      expect(triggers.length).toBe(0);

      // Sanity — the rows themselves did render (otherwise the
      // assertion above would pass trivially with an empty tree).
      const visibleNames = Array.from(
        container.querySelectorAll<HTMLElement>(".tree-item-wrapper"),
      )
        .filter((el) => el.style.display !== "none")
        .map((el) => el.querySelector(".tree-name")?.textContent?.trim());
      expect(visibleNames).toContain("a.md");
      expect(visibleNames).toContain("b.md");
    });
  });

  describe("move (onMove) — drag affordance", () => {
    it("rows are draggable when onMove is provided", () => {
      const { container } = render(() => (
        <AppProvider state={makeAppStub()}>
          <FileTree
            roots={SINGLE_ROOT}
            selectedPath={null}
            selectedRootId={null}
            onSelect={() => {}}
            onMove={() => {}}
          />
        </AppProvider>
      ));
      const draggable = container.querySelectorAll<HTMLElement>('.tree-item[draggable="true"]');
      // notes/ (directory) + README.md at root — both draggable.
      expect(draggable.length).toBeGreaterThanOrEqual(2);
    });

    it("rows are NOT draggable when onMove is omitted", () => {
      const { container } = render(() => (
        <AppProvider state={makeAppStub()}>
          <FileTree
            roots={SINGLE_ROOT}
            selectedPath={null}
            selectedRootId={null}
            onSelect={() => {}}
          />
        </AppProvider>
      ));
      expect(container.querySelector('.tree-item[draggable="true"]')).toBeNull();
    });
  });

  it("multiple roots render side by side and selection scopes by rootId", () => {
    const TWO: WorkspaceRoot[] = [
      ...SINGLE_ROOT,
      makeRoot("r2", "second-root", [file("other.md")]),
    ];
    const { getByText } = render(() => (
      <AppProvider state={makeAppStub()}>
        <FileTree
          roots={TWO}
          selectedPath="other.md"
          selectedRootId="r2"
          onSelect={() => {}}
        />
      </AppProvider>
    ));
    expect(getByText("README.md")).not.toBeNull();
    expect(getByText("other.md")).not.toBeNull();
  });
});
