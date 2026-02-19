import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import type { PolymorphicProps } from "@kobalte/core"
import * as DropdownMenuPrimitive from "@kobalte/core/dropdown-menu"

import { cn } from "~/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuGroupLabel = DropdownMenuPrimitive.GroupLabel
const DropdownMenuSub = DropdownMenuPrimitive.Sub
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

type DropdownMenuContentProps = DropdownMenuPrimitive.DropdownMenuContentProps & {
  class?: string | undefined
}

const DropdownMenuContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DropdownMenuContentProps>
) => {
  const [local, others] = splitProps(props as DropdownMenuContentProps, ["class"])
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        class={cn(
          "z-50 min-w-[8rem] origin-[var(--kb-menu-content-transform-origin)] animate-content-hide overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[expanded]:animate-content-show",
          local.class
        )}
        {...others}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

type DropdownMenuItemProps = DropdownMenuPrimitive.DropdownMenuItemProps & {
  class?: string | undefined
}

const DropdownMenuItem = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DropdownMenuItemProps>
) => {
  const [local, others] = splitProps(props as DropdownMenuItemProps, ["class"])
  return (
    <DropdownMenuPrimitive.Item
      class={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class
      )}
      {...others}
    />
  )
}

type DropdownMenuSeparatorProps = DropdownMenuPrimitive.DropdownMenuSeparatorProps & {
  class?: string | undefined
}

const DropdownMenuSeparator = <T extends ValidComponent = "hr">(
  props: PolymorphicProps<T, DropdownMenuSeparatorProps>
) => {
  const [local, others] = splitProps(props as DropdownMenuSeparatorProps, ["class"])
  return (
    <DropdownMenuPrimitive.Separator
      class={cn("-mx-1 my-1 h-px bg-muted", local.class)}
      {...others}
    />
  )
}

type DropdownMenuCheckboxItemProps = DropdownMenuPrimitive.DropdownMenuCheckboxItemProps & {
  class?: string | undefined
  children?: JSX.Element
}

const DropdownMenuCheckboxItem = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DropdownMenuCheckboxItemProps>
) => {
  const [local, others] = splitProps(props as DropdownMenuCheckboxItemProps, ["class", "children"])
  return (
    <DropdownMenuPrimitive.CheckboxItem
      class={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class
      )}
      {...(others as any)}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {local.children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
}
