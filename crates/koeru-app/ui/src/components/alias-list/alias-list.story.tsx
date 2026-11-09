import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { voiceStyle } from "~/lib/voice-color";

import { AliasList, type AliasRow } from ".";

const row = (
  key: string,
  alias: string,
  confidence: number,
  status: AliasRow["status"] = "unread",
  originalConfidence?: number,
): AliasRow => ({
  key,
  alias,
  confidence,
  status,
  // `exactOptionalPropertyTypes` を満たすため、 `undefined` のときは鍵を落とす。
  ...(originalConfidence !== undefined && { originalConfidence }),
});

const ALIASES: AliasRow[] = [
  row("k1", "- か", 0.41),
  row("k2", "a か", 0.82, "confirmed"),
  row("k3", "a き", 0.74, "confirmed"),
  row("k4", "a く", 0.63, "edited", 0.51),
  row("k5", "a け", 0.33),
  row("k6", "a こ", 0.21),
  row("k7", "- さ", 0.9, "confirmed"),
  row("k8", "a さ", 0.55, "edited", 0.42),
];

const meta = {
  title: "部品/AliasList",
  component: AliasList,
  args: {
    aliases: ALIASES,
    selected: null,
    onSelect: fn(),
  },
  decorators: [
    // 列の幅と声の色を与える。 実画面では S08 の面がこれをする。
    // `voiceStyle` を通さないと `bg-voice` と `shadow-voice-edge` が出ない。
    (Story) => (
      <div
        className="flex h-120 w-80 flex-col bg-slate-1 p-3"
        /* 返すのは `--voice-*` だけ。別ファイルの関数なので読めない。 */
        // oxlint-disable-next-line shadcn/no-inline-styles
        style={voiceStyle({ hue: 168, chroma: 0.6, lightness: 0.5 })}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AliasList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 未読と編集済みが混ざった、ふつうの状態。 */
export const 未読あり: Story = {
  args: { selected: "k1" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 行の印は grid の中だけで数える。 外のチップにも「未読」の字があるので、
    // 全体で数えると未読の総数（3）＋ チップの1 = 4 に見えて食い違う。
    const grid = within(canvas.getByRole("grid"));

    // 色だけで言わない。 未読は「未読」、編集済みは「編集済み」の字で言う
    // （`docs/reports/ux/direction.md`）。
    await expect(grid.getAllByText("未読")).toHaveLength(3);
    await expect(grid.getAllByText("編集済み")).toHaveLength(2);

    // チップに未読の総数が出る。 ノード間の空白は実装詳細に任せる。
    await expect(canvas.getByRole("button", { name: /未読\s*3/ })).toBeInTheDocument();

    // 選んだ行だけが選ばれている（grid の row に aria-selected）。
    const selectedRows = canvas.getAllByRole("row", { selected: true });
    await expect(selectedRows).toHaveLength(1);
  },
};

/** 全部確認済み。 点も「編集済み」も出ない。 */
export const 全部確認済み: Story = {
  args: {
    aliases: ALIASES.map((a) => ({ ...a, status: "confirmed" as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = within(canvas.getByRole("grid"));
    await expect(grid.queryAllByText("未読")).toHaveLength(0);
    await expect(grid.queryAllByText("編集済み")).toHaveLength(0);
    await expect(canvas.getByRole("button", { name: /未読\s*0/ })).toBeInTheDocument();
  },
};

/** 検索で 0 件。 絞り込みに当たらない字を打った状態。 */
export const 検索で0件: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `type="search"` は `role="searchbox"` に写される。
    const search = canvas.getByRole("searchbox", { name: /エイリアスを探す/ });
    await userEvent.type(search, "ぬ");
    // 空のメッセージは表の行ではない（grid の中では role を外してある）。
    await expect(canvas.getByText(/この絞り込みに当たる綴りはありません。/)).toBeInTheDocument();
    await expect(canvas.queryAllByRole("row", { selected: true })).toHaveLength(0);
  },
};

/** 確信度で並べた。 列見出しを押すと昇順になる（aria-sort も遷移）。 */
export const 確信度で並べた: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("columnheader", { name: /確信度/ });
    // 初期は none（Rust が渡した順をそのまま出す）。
    await expect(header).toHaveAttribute("aria-sort", "none");

    const sortBtn = within(header).getByRole("button");
    await userEvent.click(sortBtn);
    await expect(header).toHaveAttribute("aria-sort", "ascending");

    // 昇順の先頭は確信度 0.21。
    const rows = canvas.getAllByRole("row").slice(1); // 見出し行を除く
    await expect(rows[0]).toHaveTextContent("0.21");

    await userEvent.click(sortBtn);
    await expect(header).toHaveAttribute("aria-sort", "descending");
    const rowsDesc = canvas.getAllByRole("row").slice(1);
    await expect(rowsDesc[0]).toHaveTextContent("0.90");
  },
};
