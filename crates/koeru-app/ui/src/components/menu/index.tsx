import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";

import { tv } from "~/lib/tv";

/*
 * 押すと開く操作の一覧（⋮）。
 *
 * Radix Primitives のまま出す（`DEC-PLT-015`）。 開いたときの焦点、矢印と
 * 型入力での移動、Esc で閉じて押した元へ焦点を戻すことは、あちらが持っている。
 *
 * どれも `className` を受け取らない。 `Root` と `Trigger` も包む理由は
 * `~/components/select` の冒頭と同じ。
 */
export const Menu = (props: Omit<ComponentProps<typeof MenuPrimitive.Root>, "className">) => (
  <MenuPrimitive.Root {...props} />
);

/** 開く的。 `asChild` で `Button` を渡す。 素の要素を描かない——見た目は `Button` が持つ。 */
export const MenuTrigger = (
  props: Omit<ComponentProps<typeof MenuPrimitive.Trigger>, "className" | "asChild">,
) => <MenuPrimitive.Trigger asChild {...props} />;

export const MenuContent = ({
  children,
  ...props
}: Omit<ComponentProps<typeof MenuPrimitive.Content>, "className">) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      align="end"
      sideOffset={4}
      className="z-50 min-w-36 overflow-hidden rounded-lg border border-slate-7 bg-slate-2 p-1"
      {...props}
    >
      {children}
    </MenuPrimitive.Content>
  </MenuPrimitive.Portal>
);

/*
 * `danger` は消すもの。 字だけ red にする。 塗らない——一覧の中で1つだけ塗ると、
 * 開いた瞬間に目がそこへ行き、押すつもりの無いものが主に見える。
 */
const item = tv({
  variants: {
    tone: {
      default: "text-slate-12",
      danger: "text-red-11",
    },
  },
  defaultVariants: { tone: "default" },
});

type MenuItemProps = Omit<ComponentProps<typeof MenuPrimitive.Item>, "className"> & {
  tone?: "default" | "danger";
};

export const MenuItem = ({ tone, ...props }: MenuItemProps) => (
  <MenuPrimitive.Item
    className={`flex h-10 cursor-default select-none items-center rounded-md px-3 text-sm data-[disabled]:opacity-45 data-[highlighted]:bg-slate-3 data-[highlighted]:outline-hidden ${item({ tone })}`}
    {...props}
  />
);
