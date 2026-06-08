import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { SelectionPopover } from "./selection-popover.tsx";

afterEach(cleanup);

describe("SelectionPopover", () => {
  it("renders nothing when there is no selection", () => {
    const { baseElement } = render(() => <SelectionPopover info={null} onAddToChat={() => {}} />);
    expect(baseElement.querySelector(".selection-popover")).toBeNull();
  });

  it("renders 'Add to chat' and fires the callback", () => {
    const onAddToChat = vi.fn();
    const { baseElement } = render(() => (
      <SelectionPopover info={{ left: 100, bottom: 50 }} onAddToChat={onAddToChat} />
    ));
    const btns = baseElement.querySelectorAll<HTMLElement>(".selection-popover-btn");
    expect(btns).toHaveLength(1);
    fireEvent.click(btns[0]);
    expect(onAddToChat).toHaveBeenCalledTimes(1);
  });
});
