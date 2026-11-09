import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { VoiceSetup } from ".";
import type { Voice } from "./model";

type Props = ComponentProps<typeof VoiceSetup>;

/** 名前と表を story の中で持つ。 部品はどちらも置く側が制御する。 */
const Setup = ({ name: initialName, voices: initialVoices, ...rest }: Props) => {
  const [name, setName] = useState(initialName);
  const [voices, setVoices] = useState(initialVoices);
  return (
    <VoiceSetup
      {...rest}
      name={name}
      onNameChange={(next) => {
        setName(next);
        rest.onNameChange(next);
      }}
      voices={voices}
      onVoicesChange={(next) => {
        setVoices(next);
        rest.onVoicesChange(next);
      }}
    />
  );
};

const A3 = 57;
const G4 = 67;
const C5 = 72;

/** ボード S02 の7枠。 声色なしと Whisper が CVVC の A3・G4、Whisper の連続音 C5、Growl の単独音 A3・C5。 */
const BOARD: Voice[] = [
  { id: "none", name: "", lanes: [{ id: "none-cvvc", method: "CVVC", tones: [A3, G4] }] },
  {
    id: "whisper",
    name: "Whisper",
    lanes: [
      { id: "whisper-cvvc", method: "CVVC", tones: [A3, G4] },
      { id: "whisper-seq", method: "SEQUENTIAL", tones: [C5] },
    ],
  },
  {
    id: "growl",
    name: "Growl",
    lanes: [{ id: "growl-single", method: "SINGLE", tones: [A3, C5] }],
  },
];

const meta = {
  title: "部品/VoiceSetup",
  component: VoiceSetup,
  render: (args) => <Setup {...args} />,
  args: {
    name: "新しい音源 3",
    onNameChange: fn(),
    voices: BOARD,
    onVoicesChange: fn(),
    estimate: { rows: 843, seconds: 11_460 },
    devices: [
      { id: "usb", name: "USB Audio CODEC" },
      { id: "mac", name: "MacBook Pro のマイク" },
    ],
    deviceId: "usb",
    onDeviceChange: fn(),
    onStart: fn(),
  },
  /*
   * 画面と同じスクロールの箱に入れる。 `body` は `globals.css` が固定しているので、
   * 箱が無いと表が長くなっても送れず、下の段の張り付き（`sticky`）も見えない。
   * 下の余白は 0——`sticky` は余白の内側に張り付くので、余白があると段の下に隙間が空く。
   */
  decorators: [
    (Story) => <div className="h-screen w-280 overflow-y-auto px-4 pt-4">{Story()}</div>,
  ],
} satisfies Meta<typeof VoiceSetup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 枠が1つも無い。 始められず、理由がボタンの横に出る。 */
export const 何もない: Story = {
  args: { voices: [], estimate: null },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    // 押せないボタンにも焦点は当たり、理由が説明として読まれる。 押しても始まらない。
    const start = c.getByRole("button", { name: "収録をはじめる" });
    start.focus();
    await expect(start).toHaveFocus();
    await expect(start).toHaveAccessibleDescription("音階を1つ以上選んでください");
    // ポインタは届かない（`pointer-events: none`）。 キーボードで押しても始まらない。
    await userEvent.keyboard("{Enter}");
    await expect(args.onStart).not.toHaveBeenCalled();
    await expect(c.getByRole("button", { name: /収録をはじめる/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(c.getByText("音階を1つ以上選んでください")).toBeVisible();
    // 送りは表があるときだけ。
    await expect(c.queryByRole("button", { name: "鍵盤を左へ送る" })).toBeNull();
  },
};

/** ボードと同じ7枠。 始められる。 */
export const ボードと同じ7枠: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "サブバンク 7" })).toBeVisible();
    await expect(c.getByText("約 3 時間 11 分", { exact: false })).toBeVisible();
    // 声色なしの名前の欄は空のまま。 「声色なし」は欄の中の薄い字で、値ではない。
    const names = c.getAllByRole("textbox", { name: /番目の声色の名前$/ });
    await expect(names.map((n) => (n as HTMLInputElement).value)).toEqual(["", "Whisper", "Growl"]);
    // 名前の欄は声色ごとに1つ。 Whisper の2本目には無い。
    await expect(c.getByRole("toolbar", { name: "Whisper 連続音 の鍵盤" })).toBeVisible();
    // レーンのつまみは、声色の中にレーンが2本以上あるときだけ。
    await expect(c.queryByRole("button", { name: "Growl 単独音 を並べ替える" })).toBeNull();
    await expect(c.getByRole("button", { name: "Whisper CVVC を並べ替える" })).toBeVisible();
    await expect(c.getByRole("button", { name: "声色 Growl を並べ替える" })).toBeVisible();
    const start = c.getByRole("button", { name: "収録をはじめる" });
    await expect(start).not.toHaveAttribute("aria-disabled");
    await userEvent.click(start);
    await expect(args.onStart).toHaveBeenCalledTimes(1);
  },
};

/**
 * 同じ名前の声色。 編集は止めず、始めるのだけを止める。
 * 末尾に空白のある「Whisper 」は別の綴りなので、Whisper とは重ならない。
 */
export const 重複あり: Story = {
  args: {
    voices: [
      ...BOARD,
      { id: "growl-2", name: "Growl", lanes: [{ id: "growl-2-cvvc", method: "CVVC", tones: [] }] },
      {
        id: "whisper-dup",
        name: "Whisper ",
        lanes: [{ id: "whisper-dup-cvvc", method: "CVVC", tones: [G4] }],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("button", { name: /収録をはじめる/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(c.getByText("同じ名前の声色があります（Growl）")).toBeVisible();
    // 末尾の空白は別の綴り。 「Whisper 」は Whisper と重ならない。
    await expect(c.queryByText(/同じ名前の声色があります（.*Whisper/)).toBeNull();
    await expect(c.getAllByText("同じ名前の声色がほかにあります")).toHaveLength(2);
  },
};

/** 同じ組の枠。 レーンの下に、どの鍵が重なっているかを音名で出す。 */
export const 組の重複: Story = {
  args: {
    voices: [
      {
        id: "whisper",
        name: "Whisper",
        lanes: [
          { id: "whisper-cvvc", method: "CVVC", tones: [A3, G4] },
          { id: "whisper-cvvc-2", method: "CVVC", tones: [G4, C5] },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("同じ声色に、方式と音階が同じ枠があります")).toBeVisible();
    await expect(c.getAllByText("G4 がほかの枠と同じ組です")).toHaveLength(2);
    // 鍵は押せなくしない。 重なっている G4 も外せる。
    await userEvent.click(c.getAllByRole("button", { name: "G4 を外す" })[1] as HTMLElement);
    await expect(c.queryByText("G4 がほかの枠と同じ組です")).toBeNull();
    await expect(c.getByRole("button", { name: "収録をはじめる" })).not.toHaveAttribute(
      "aria-disabled",
    );
  },
};

/** 声色なしが2つ。 名前の重なりとして止める。 */
export const 声色なしが二つ: Story = {
  args: {
    voices: [
      { id: "a", name: "", lanes: [{ id: "a-cvvc", method: "CVVC", tones: [A3] }] },
      { id: "b", name: "", lanes: [{ id: "b-single", method: "SINGLE", tones: [C5] }] },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(
      c.getByText("声色なしが2つあります。どちらかに名前を付けてください"),
    ).toBeVisible();
    await expect(c.getByRole("button", { name: /収録をはじめる/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

/** 音源名が空なら始められない。 空白だけの名前も空として扱う。 */
export const 名前が空: Story = {
  args: { name: "" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const start = c.getByRole("button", { name: "収録をはじめる" });
    await expect(start).toHaveAttribute("aria-disabled", "true");
    await expect(start).toHaveAccessibleDescription("音源名を入れてください");
    // 空白だけでも始められない。
    await userEvent.type(c.getByRole("textbox", { name: "音源名" }), "  ");
    await expect(start).toHaveAttribute("aria-disabled", "true");
    // 字を入れると始められる。
    await userEvent.type(c.getByRole("textbox", { name: "音源名" }), "ミナ");
    await expect(start).not.toHaveAttribute("aria-disabled");
  },
};

/** 音源名の欄で Enter を押しても始めない。 */
export const 音源名でEnterを押しても始めない: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "音源名" }), "{Enter}");
    await expect(args.onStart).not.toHaveBeenCalled();
  },
};

/** 追加は同じ声色の中、そのレーンのすぐ下に、同じ方式で音階の無いレーンを足す。 */
export const 追加: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Growl 単独音 の操作" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "追加" }));
    const growl = c.getByRole("listitem", { name: "Growl" });
    const lanes = within(growl).getAllByRole("toolbar");
    await expect(lanes).toHaveLength(2);
    // 足したレーンは音階なし。 枠の数は変わらない。
    await expect(
      within(lanes[1] as HTMLElement).queryByRole("button", { name: /を外す/ }),
    ).toBeNull();
    await expect(c.getByRole("heading", { name: "サブバンク 7" })).toBeVisible();
    // 同じ方式のレーンが並ぶと、操作の名前に何本目かが付く。 同じ名前だと読み上げで見分けられない。
    await expect(c.getByRole("button", { name: "Growl 単独音 1 の操作" })).toBeVisible();
    await expect(c.getByRole("button", { name: "Growl 単独音 2 の操作" })).toBeVisible();
    // 2本になったので、レーンのつまみが出る。
    await expect(c.getByRole("button", { name: "Growl 単独音 1 を並べ替える" })).toBeVisible();
    // 音階を選んでいないレーンがあるあいだは始められない。
    await expect(c.getByText("音階を選んでいません")).toBeVisible();
    await expect(c.getByText("音階を選んでいないレーンがあります")).toBeVisible();
    await expect(c.getByRole("button", { name: /収録をはじめる/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // 音階を選ぶと始められる。
    await userEvent.click(
      within(lanes[1] as HTMLElement).getByRole("button", { name: "E4 を足す" }),
    );
    await expect(c.getByRole("button", { name: "収録をはじめる" })).not.toHaveAttribute(
      "aria-disabled",
    );
  },
};

/** 帯の一番下の「＋ レーンを追加する」は、その声色の最後に、同じ方式で音階の無いレーンを足す。 */
export const 帯の中でレーンを追加する: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /^Whisper に\s?レーンを追加する$/ }));
    const whisper = c.getByRole("listitem", { name: /^Whisper$/ });
    const toolbars = within(whisper).getAllByRole("toolbar");
    await expect(toolbars).toHaveLength(3);
    // 最後のレーン（連続音）と同じ方式で、音階なし。
    await expect(toolbars[2]).toHaveAccessibleName("Whisper 連続音 2 の鍵盤");
    await expect(
      within(toolbars[2] as HTMLElement).queryByRole("button", { name: /を外す/ }),
    ).toBeNull();
    // ほかの声色は変わらない。
    const growl = c.getByRole("listitem", { name: /^Growl$/ });
    await expect(within(growl).getAllByRole("toolbar")).toHaveLength(1);
  },
};

/**
 * 複製はそのレーンを写した新しい声色を、元の声色のすぐ下に作る。 名前も写すので、
 * そのままでは始められない。 名前の欄に焦点が移り、全体が選ばれているので打ち直せる。
 */
export const 複製: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Whisper 連続音 の操作" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "複製" }));
    const names = c.getAllByRole("textbox", { name: /番目の声色の名前$/ });
    await expect(names.map((n) => (n as HTMLInputElement).value)).toEqual([
      "",
      "Whisper",
      "Whisper",
      "Growl",
    ]);
    const copy = names[2] as HTMLInputElement;
    await expect(copy).toHaveFocus();
    await expect([copy.selectionStart, copy.selectionEnd]).toEqual([0, "Whisper".length]);
    await expect(c.getByRole("button", { name: /収録をはじめる/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // 名前の重なりで説明がつく組の重なりは、レーンの下に二重に出さない。
    await expect(c.queryByText(/がほかの枠と同じ組です/)).toBeNull();
    // 打ち直すと重なりが消える。
    await userEvent.keyboard("Sweet");
    await expect(c.getByRole("button", { name: "収録をはじめる" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await expect(c.getByRole("heading", { name: "サブバンク 8" })).toBeVisible();
  },
};

/** 削除は確認しない。 焦点は次のレーンの ⋮ へ移る。 最後のレーンなら声色ごと消える。 */
export const 削除: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Whisper CVVC の操作" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "削除" }));
    await expect(c.getByRole("button", { name: "Whisper 連続音 の操作" })).toHaveFocus();
    await userEvent.click(c.getByRole("button", { name: "Whisper 連続音 の操作" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "削除" }));
    await expect(c.queryByRole("listitem", { name: "Whisper" })).toBeNull();
    await expect(c.getByRole("button", { name: "Growl 単独音 の操作" })).toHaveFocus();
  },
};

/** 全部消すと「何もない」へ。 焦点は「＋ 声色を追加する」へ移る。 */
export const 全部消す: Story = {
  args: {
    voices: [{ id: "only", name: "", lanes: [{ id: "only-cvvc", method: "CVVC", tones: [A3] }] }],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "声色なし CVVC の操作" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "削除" }));
    await expect(c.getByRole("button", { name: "声色を追加する" })).toHaveFocus();
    await expect(c.getByText("音階を1つ以上選んでください")).toBeVisible();
  },
};

/** 「＋ 声色を追加する」は表の下に、名前の無い CVVC の声色を足す。 */
export const 声色を追加する: Story = {
  args: { voices: [] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "声色を追加する" }));
    // 足した声色の名前の欄へ焦点が移る。 名前を付けるのが次にすること。
    await expect(c.getByRole("textbox", { name: "1 番目の声色の名前" })).toHaveFocus();
    const voice = c.getByRole("listitem", { name: "声色なし" });
    await expect(within(voice).getByRole("radio", { name: "CVVC" })).toBeChecked();
    // 音階を選ぶまで始められない。
    await expect(c.getByRole("button", { name: /収録をはじめる/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // 枠が1つも無いときは、空のレーンの理由を重ねない。
    await expect(c.queryByText("音階を選んでいないレーンがあります")).toBeNull();
    await userEvent.click(within(voice).getByRole("button", { name: "A3 を足す" }));
    await expect(c.getByRole("button", { name: "収録をはじめる" })).not.toHaveAttribute(
      "aria-disabled",
    );
  },
};

/**
 * キーボードで並べ替える。 つまみで Space を押して持ち上げ、矢印で動かし、Space で置く。
 * Esc なら元の位置へ戻る。 動かしたあとも焦点はつまみに残る。
 */
export const キーボードで並べ替える: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    const names = () =>
      c
        .getAllByRole("textbox", { name: /番目の声色の名前$/ })
        .map((n) => (n as HTMLInputElement).value);
    const grip = () => c.getByRole("button", { name: "声色 Growl を並べ替える" });
    grip().focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    await expect(names()).toEqual(["", "Growl", "Whisper"]);
    // 持ち上げているあいだは、置かれる所に影が出る。
    const band = () => c.getByRole("listitem", { name: /^Growl$/ });
    await expect(band()).toHaveAttribute("data-moving", "true");
    await expect(grip()).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard(" ");
    await expect(names()).toEqual(["Growl", "", "Whisper"]);
    await expect(band()).not.toHaveAttribute("data-moving");
    await expect(args.onStart).not.toHaveBeenCalled();

    // Esc は持ち上げた位置へ戻す。
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect(names()).toEqual(["", "Whisper", "Growl"]);
    await userEvent.keyboard("{Escape}");
    await expect(names()).toEqual(["Growl", "", "Whisper"]);

    // レーンは声色の中だけで動く。 先頭のレーンは上へ動かない。
    const lane = c.getByRole("button", { name: "Whisper 連続音 を並べ替える" });
    lane.focus();
    await userEvent.keyboard(" {ArrowUp} ");
    const whisper = c.getByRole("listitem", { name: "Whisper" });
    const toolbars = within(whisper).getAllByRole("toolbar");
    await expect(toolbars[0]).toHaveAccessibleName("Whisper 連続音 の鍵盤");
    await userEvent.keyboard(" {ArrowUp} ");
    await expect(within(whisper).getAllByRole("toolbar")[0]).toHaveAccessibleName(
      "Whisper 連続音 の鍵盤",
    );
  },
};

/** 送りは表全体で1組。 全レーンが同じ窓を見る。 */
export const 窓を送る: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "鍵盤を右へ送る" }));
    // C3〜C6 から1オクターブ右へ。 どのレーンにも C7 が見える。
    await expect(c.getAllByRole("button", { name: "C7 を足す" })).toHaveLength(4);
  },
};

/** マイクが無い。 選べないことを字で言う。 */
export const マイクが無い: Story = {
  args: { devices: [], deviceId: undefined },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("combobox", { name: "入力デバイス" })).toHaveTextContent(
      "マイクがありません",
    );
  },
};

/** 前回のマイクが今の一覧に無い（外した USB マイクなど）。 選んでいないものとして出す。 */
export const 前回のマイクが無い: Story = {
  args: { devices: [{ id: "mac", name: "MacBook Pro のマイク" }], deviceId: "usb" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("combobox", { name: "入力デバイス" })).toHaveTextContent(
      "マイクを選ぶ",
    );
  },
};

/**
 * 窓の外にある選択は、レーンの左の列に音名で出る。 押すとその音階が見える所まで送る。
 * 黙って消えると、外したのか隠れただけなのかが分からない。
 */
export const 窓の外の選択: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "鍵盤を右へ送る" }));
    // C4〜C7 になり、A3 が左に隠れる（声色なし・Whisper の CVVC・Growl）。
    const hidden = c.getAllByRole("button", { name: /^左に隠れている音階\s?A3$/ });
    await expect(hidden).toHaveLength(3);
    await userEvent.click(hidden[0] as HTMLElement);
    await expect(c.queryByRole("button", { name: /隠れている音階/ })).toBeNull();
    // 押した印は消えるので、焦点は見えるようになった鍵へ移る。
    await waitFor(() => expect(c.getAllByRole("button", { name: "A3 を外す" })[0]).toHaveFocus());
    await expect(c.getAllByRole("button", { name: "A3 を外す" })).toHaveLength(3);
  },
};

/** 声色が多い表。 箱の中で送れて、下の段（見積もり・マイク・開始）が下端に張り付いたまま残る。 */
export const 長い表: Story = {
  args: {
    voices: [
      ...BOARD,
      ...["Sweet", "Power", "Soft", "Falsetto", "Breath"].map((name, index) => ({
        id: `extra-${index}`,
        name,
        lanes: [{ id: `extra-${index}-cvvc`, method: "CVVC" as const, tones: [A3, G4, C5] }],
      })),
    ],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const box = canvasElement.querySelector<HTMLElement>(".overflow-y-auto");
    await expect(box).not.toBeNull();
    await expect((box?.scrollHeight ?? 0) > (box?.clientHeight ?? 0)).toBe(true);
    // 送っても、開始のボタンは箱の中に見えたまま。
    box?.scrollTo(0, box.scrollHeight);
    const start = c.getByRole("button", { name: "収録をはじめる" }).getBoundingClientRect();
    const frame = box?.getBoundingClientRect();
    await expect(start.bottom <= (frame?.bottom ?? 0)).toBe(true);
  },
};

/*
 * 暗い面。 story の試験は既定のテーマ（明るい面）でしか回らないので、テーマを切り替えずに
 * `.dark` の箱で包んで測る（`styles/palette.story.tsx` と同じ形）。 `.dark` は `color-scheme` も
 * 持つので、声の色の `light-dark()` も箱の中で暗い面の値になる。
 *
 * 箱はスクロールの箱の余白まで広げる。 広げないと、余白だけ明るい地が縁に残る。
 * メニューや選択の一覧は `body` へ描かれ（portal）、この箱の外に出るので、開いた絵は測らない。
 */
const inDark: Decorator = (Story) => (
  <div className="dark -mx-4 -mt-4 min-h-full bg-slate-1 px-4 pt-4 text-slate-12">{Story()}</div>
);

export const 暗い面: Story = {
  decorators: [inDark],
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".dark")).not.toBeNull();
  },
};

/** 暗い面の重複。 琥珀色の輪郭と字（段 12）を、暗い地と帯の上で測る。 */
export const 暗い面_重複あり: Story = {
  ...重複あり,
  decorators: [inDark],
};

/** 暗い面の空の表。 ボタン横の理由と、押せない開始ボタン。 */
export const 暗い面_何もない: Story = {
  args: { voices: [], estimate: null },
  decorators: [inDark],
};
