import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Menu, MenuContent, MenuItem, MenuTrigger } from ".";
import { Button } from "~/components/button";
import { Icon } from "~/components/icon";

type ExampleProps = {
  onAdd: () => void;
  onRemove: () => void;
  open?: boolean;
};

const Example = ({ onAdd, onRemove, open }: ExampleProps) => (
  <div className="flex h-48 w-72 items-start justify-end">
    {/*
     * 開いたまま描くときは周りを隠さない。 Radix は開いているあいだ外を `aria-hidden` にし、
     * そのまま axe に当てると、隠れた ⋮ に焦点が当たりうるとして落ちる。
     */}
    <Menu {...(open === undefined ? {} : { open, modal: false })}>
      <MenuTrigger>
        <Button variant="ghost" size="icon-sm" aria-label="Whisper CVVC の操作">
          <Icon name="kebab" size={14} />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={onAdd}>追加</MenuItem>
        <MenuItem disabled>複製</MenuItem>
        <MenuItem tone="danger" onSelect={onRemove}>
          削除
        </MenuItem>
      </MenuContent>
    </Menu>
  </div>
);

const meta = {
  title: "部品/Menu",
  component: Example,
  args: { onAdd: fn(), onRemove: fn() },
} satisfies Meta<typeof Example>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 閉じている: Story = {};

/** 開いた見た目。 字の配色（消すものだけ red）を axe に当てる。 */
export const 開いている: Story = { args: { open: true } };

/**
 * キーボードだけで開いて選べる。
 *
 * Enter で開くと先頭の項目に焦点が入り、矢印で動く。 押せない項目は飛ばす。
 * 選ぶと閉じて、焦点は開いた元へ戻る。
 */
export const キーボードで選ぶ: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.tab();
    const trigger = c.getByRole("button", { name: "Whisper CVVC の操作" });
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const body = within(document.body);
    await expect(await body.findByRole("menuitem", { name: "追加" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    // 押せない「複製」は飛ばす。
    await expect(body.getByRole("menuitem", { name: "削除" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onRemove).toHaveBeenCalledTimes(1);
    await expect(args.onAdd).not.toHaveBeenCalled();
    await expect(body.queryByRole("menu")).toBeNull();
    await expect(trigger).toHaveFocus();
  },
};
