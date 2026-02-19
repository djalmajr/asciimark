import { Show } from "solid-js";
import IconFolder from "~icons/lucide/folder-open";
import IconFileDown from "~icons/lucide/file-down";
import IconPanelLeft from "~icons/lucide/panel-left";
import IconListTree from "~icons/lucide/list-tree";
import IconSun from "~icons/lucide/sun";
import IconMoon from "~icons/lucide/moon";
import IconSettings from "~icons/lucide/settings";

import { Toggle } from "./ui/toggle.tsx";
import { Switch, SwitchControl, SwitchThumb } from "./ui/switch.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip.tsx";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu.tsx";

interface ToolbarProps {
  rootName: string;
  fileName: string | null;
  filePath: string | null;
  autoRefresh: boolean;
  hasFile: boolean;
  sidebarVisible: boolean;
  tocVisible: boolean;
  darkMode: boolean;
  onToggleAutoRefresh: () => void;
  onToggleSidebar: () => void;
  onToggleToc: () => void;
  onToggleDarkMode: () => void;
  onOpenFolder: () => void;
  onExportPdf: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header
      class="toolbar no-print"
      ref={(el) => {
        const update = () => {
          const h = el.offsetHeight;
          document.documentElement.style.setProperty("--toolbar-h", `${h}px`);
        };
        update();
        // Update on resize in case toolbar wraps
        new ResizeObserver(update).observe(el);
      }}
    >
      <div class="toolbar-left">
        <Show when={props.rootName || props.filePath}>
          <span class="breadcrumb">
            <Show when={props.rootName}>
              <span class="breadcrumb-root">{props.rootName}</span>
            </Show>
            <Show when={props.filePath}>
              <Show when={props.rootName}>
                <span class="breadcrumb-sep">/</span>
              </Show>
              <span class="breadcrumb-file">{props.filePath}</span>
            </Show>
          </span>
        </Show>
      </div>
      <div class="toolbar-right">
        {/* Dark mode switch with sun/moon icon inside thumb */}
        <Tooltip>
          <TooltipTrigger
            as="div"
            class="inline-flex items-center"
          >
            <Switch
              class="flex items-center"
              checked={props.darkMode}
              onChange={props.onToggleDarkMode}
            >
              <SwitchControl class="dark-mode-switch">
                <SwitchThumb class="dark-mode-thumb">
                  <Show
                    when={props.darkMode}
                    fallback={<IconSun width={12} height={12} />}
                  >
                    <IconMoon width={12} height={12} />
                  </Show>
                </SwitchThumb>
              </SwitchControl>
            </Switch>
          </TooltipTrigger>
          <TooltipContent>{props.darkMode ? "Dark mode" : "Light mode"}</TooltipContent>
        </Tooltip>
        <Show when={props.rootName}>
          <Tooltip>
            <TooltipTrigger
              as={Toggle}
              size="sm"
              variant="outline"
              pressed={props.sidebarVisible}
              onChange={props.onToggleSidebar}
              aria-label="Toggle sidebar"
            >
              <IconPanelLeft width={16} height={16} />
            </TooltipTrigger>
            <TooltipContent>Toggle sidebar</TooltipContent>
          </Tooltip>
        </Show>
        <Show when={props.hasFile}>
          <Tooltip>
            <TooltipTrigger
              as={Toggle}
              size="sm"
              variant="outline"
              pressed={props.tocVisible}
              onChange={props.onToggleToc}
              aria-label="Toggle table of contents"
            >
              <IconListTree width={16} height={16} />
            </TooltipTrigger>
            <TooltipContent>Toggle table of contents</TooltipContent>
          </Tooltip>
        </Show>
        {/* Settings dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              as={DropdownMenuTrigger}
              class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-8"
            >
              <IconSettings width={16} height={16} />
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent class="w-48">
            <DropdownMenuItem onSelect={props.onOpenFolder}>
              <IconFolder width={14} height={14} />
              Open Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={props.autoRefresh}
              onChange={props.onToggleAutoRefresh}
            >
              Auto-refresh
            </DropdownMenuCheckboxItem>
            <Show when={props.hasFile}>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={props.onExportPdf}>
                <IconFileDown width={14} height={14} />
                Export as PDF
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
