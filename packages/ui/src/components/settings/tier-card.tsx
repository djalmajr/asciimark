import { Show, type JSX } from "solid-js";
import IconCheck from "~icons/lucide/check";

export interface TierCardProps {
  title: string;
  description: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}

/** A Workspace-indexing tier card (Off / Lite / Full) — DJA-15. UI only in M1;
 *  the indexing logic is M2 (ADR-002). */
export function TierCard(props: TierCardProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      class="settings-tier-card"
      classList={{ "settings-tier-card-selected": props.selected }}
      onClick={() => props.onSelect()}
    >
      <div class="settings-tier-head">
        <span class="settings-tier-title">{props.title}</span>
        <Show when={props.badge}>
          <span class="settings-tier-badge">{props.badge}</span>
        </Show>
        <Show when={props.selected}>
          <IconCheck width={14} height={14} class="settings-tier-check" />
        </Show>
      </div>
      <p class="settings-tier-desc">{props.description}</p>
    </button>
  );
}
