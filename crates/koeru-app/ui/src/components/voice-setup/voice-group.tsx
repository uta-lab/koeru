import { type RefObject, useId } from "react";

import { Button } from "~/components/button";
import { Icon } from "~/components/icon";
import { LaneKeyboard } from "~/components/lane-keyboard";
import { type ToneSpan, snapSpan } from "~/components/lane-keyboard/geometry";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "~/components/menu";
import { Segment } from "~/components/segment";
import { methodName } from "~/components/app-shell/subbank";
import { toneName } from "~/lib/tones";
import { cx, tv } from "~/lib/tv";

import {
  type Lane,
  type Problems,
  SETUP_METHODS,
  type SetupMethod,
  type Voice,
  clashNote,
  laneLabelsOf,
  voiceLabel,
} from "./model";
import { type Dragging, useReorder } from "./reorder";

type GripProps = ReturnType<ReturnType<typeof useReorder>["grip"]>;
type RowProps = ReturnType<ReturnType<typeof useReorder>["row"]>;

type VoiceGroupProps = {
  voice: Voice;
  /** 何番目の声色か（1 始まり）。 名前の欄の名前に使う。 */
  position: number;
  problems: Problems;
  range: ToneSpan;
  view: ToneSpan;
  /** 声色を並べ替えるつまみと、落とせる行。 声色の並びは置く側が持つ。 */
  voiceGrip: GripProps;
  voiceRow: RowProps;
  dragging: RefObject<Dragging>;
  announce: (message: string) => void;
  onRename: (name: string) => void;
  onMethod: (laneId: string, method: SetupMethod) => void;
  onToggle: (laneId: string, tone: number) => void;
  /** 窓の外にある選択を見に行く。 その音階が見える所まで、全レーンの窓を送る。 */
  onReveal: (tone: number) => void;
  onAddLane: (laneId: string) => void;
  /** 帯の一番下の「＋ レーンを追加する」。 声色の最後に足す。 */
  onAppendLane: () => void;
  onDuplicateLane: (laneId: string) => void;
  onRemoveLane: (laneId: string) => void;
  onMoveLane: (from: number, to: number) => void;
  /** 名前の欄と ⋮ を、焦点を移す先として覚えてもらう。 */
  nameRef: (element: HTMLInputElement | null) => void;
  menuRef: (laneId: string, element: HTMLButtonElement | null) => void;
  /**
   * メニューが閉じて、焦点を ⋮ へ戻そうとしたとき（Radix の `onCloseAutoFocus`）。
   * 複製や削除のように焦点の行き先を置く側が決めた操作のあとは、置く側が止めて移す。
   */
  onMenuClosed: (event: Event) => void;
};

/**
 * 声色1つ。 名前の欄と、その中のレーン。
 *
 * 名前の欄は先頭のレーンの左にだけ置く。 2本目からは方式だけ（ボード S02 の Whisper）。
 *
 * レーンの並べ替えはこの声色の中だけ。 ほかの声色の上で離しても動かない——
 * 別の声色へ移すのは名前の付け替えで、並べ替えではない。
 */
export const VoiceGroup = ({
  voice,
  position,
  problems,
  range,
  view,
  voiceGrip,
  voiceRow,
  dragging,
  announce,
  onRename,
  onMethod,
  onToggle,
  onReveal,
  onAddLane,
  onAppendLane,
  onDuplicateLane,
  onRemoveLane,
  onMoveLane,
  nameRef,
  menuRef,
  onMenuClosed,
}: VoiceGroupProps) => {
  const laneIds = voice.lanes.map((l) => l.id);
  const labels = laneLabelsOf(voice);
  const lanes = useReorder({
    scope: `lanes:${voice.id}`,
    ids: laneIds,
    onMove: onMoveLane,
    labelOf: (id) => labels.get(id) ?? "",
    announce,
    dragging,
  });

  const nameClash = problems.nameClashes.has(voice.id);
  const clashing =
    nameClash ||
    voice.lanes.some((l) => problems.toneClashes.has(l.id) || problems.emptyLanes.has(l.id));
  const name = voiceLabel(voice.name);

  /*
   * 声色のつまみは帯の右端、レーンのつまみのさらに右に置く。 帯全体の縦の真ん中に置くので、
   * どのレーンの行にも属さない——持ち上げた絵も帯ごとになる（`[data-reorder-row]` が帯）。
   */
  return (
    <li
      {...voiceRow}
      aria-label={name}
      className={cx(
        "relative isolate flex scroll-mb-28 items-center gap-1 rounded-xl border bg-surface-1 px-4 data-[moving]:border-transparent data-[moving]:after:absolute data-[moving]:after:inset-0 data-[moving]:after:z-20 data-[moving]:after:rounded-xl data-[moving]:after:bg-surface-3",
        clashing ? "border-attention" : "border-line",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col pb-3">
        <ol className="flex flex-col divide-y divide-line">
          {voice.lanes.map((lane, index) => (
            <LaneRow
              key={lane.id}
              voice={voice}
              lane={lane}
              label={labels.get(lane.id) ?? ""}
              first={index === 0}
              position={position}
              alone={voice.lanes.length === 1}
              clash={problems.toneClashes.get(lane.id)}
              empty={problems.emptyLanes.has(lane.id)}
              nameClash={nameClash}
              range={range}
              view={view}
              grip={lanes.grip(lane.id)}
              row={lanes.row(lane.id)}
              onRename={onRename}
              onMethod={(method) => onMethod(lane.id, method)}
              onToggle={(tone) => onToggle(lane.id, tone)}
              onReveal={onReveal}
              onAdd={() => onAddLane(lane.id)}
              onDuplicate={() => onDuplicateLane(lane.id)}
              onRemove={() => onRemoveLane(lane.id)}
              nameRef={nameRef}
              menuRef={(element) => menuRef(lane.id, element)}
              onMenuClosed={onMenuClosed}
            />
          ))}
        </ol>
        {/*
         * 表の下の「＋ 声色を追加する」と同じ形の、帯の中の版。 帯の中には同じ字のボタンが
         * 声色の数だけ並ぶので、読み上げには声色の名前を前に足す（見える字は名前の中に残る）。
         *
         * 幅は鍵盤の列の左端から右端まで。 帯の幅いっぱいにすると、表全体に重ねた鍵盤の
         * 送り（`VoiceSetup` の `shiftButton`）が上を横切り、その幅だけ押しても送りに取られる。
         * 左は左の列（`w-54`）と間（`gap-4`）と鍵盤の余白（`px-8`）、右は ⋮ とつまみ
         * （`w-7` `gap-1` `w-6`）と間と余白のぶんだけ空ける。 どれかを変えたら揃える。
         */}
        <button
          type="button"
          onClick={onAppendLane}
          className="mr-26 ml-66 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-sm text-2 hover:text-1"
        >
          <Icon name="plus" size={12} />
          <span className="sr-only">{name} に</span>
          レーンを追加する
        </button>
      </div>
      <Grip {...voiceGrip} span="voice" label={`声色 ${name} を並べ替える`} />
    </li>
  );
};

type LaneRowProps = {
  voice: Voice;
  lane: Lane;
  /** 読み上げにも使う名前。 同じ方式のレーンが並ぶと番号が付く（`laneLabelsOf`）。 */
  label: string;
  first: boolean;
  position: number;
  /** 声色の中のレーンがこれ1本。 並べ替える相手がいない。 */
  alone: boolean;
  /** このレーンで、ほかの枠と組が重なっている音階。 */
  clash: readonly number[] | undefined;
  /** 音階を1つも選んでいない。 */
  empty: boolean;
  nameClash: boolean;
  range: ToneSpan;
  view: ToneSpan;
  grip: GripProps;
  row: RowProps;
  onRename: (name: string) => void;
  onMethod: (method: SetupMethod) => void;
  onToggle: (tone: number) => void;
  onReveal: (tone: number) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  nameRef: (element: HTMLInputElement | null) => void;
  menuRef: (element: HTMLButtonElement | null) => void;
  onMenuClosed: (event: Event) => void;
};

const LaneRow = ({
  voice,
  lane,
  label,
  first,
  position,
  alone,
  clash,
  empty,
  nameClash,
  range,
  view,
  grip,
  row,
  onRename,
  onMethod,
  onToggle,
  onReveal,
  onAdd,
  onDuplicate,
  onRemove,
  nameRef,
  menuRef,
  onMenuClosed,
}: LaneRowProps) => {
  const clashId = useId();
  // 窓の外にある選択。 鍵盤には描かれないので、音名で言う。 黙って消えると、外したのか
  // 隠れただけなのか分からず、重複の注記が指す音階も探せない。
  const [from, to] = snapSpan(view);
  const below = lane.tones.filter((t) => t < from);
  const above = lane.tones.filter((t) => t > to);
  return (
    <li
      {...row}
      aria-label={label}
      className="relative isolate flex scroll-mb-28 flex-col gap-1.5 rounded-lg py-3 data-[moving]:after:absolute data-[moving]:after:inset-0 data-[moving]:after:z-20 data-[moving]:after:rounded-lg data-[moving]:after:bg-surface-3"
    >
      <div className="flex items-center gap-4">
        <div className="flex w-54 shrink-0 flex-col gap-2">
          {first && (
            <input
              ref={nameRef}
              type="text"
              autoComplete="off"
              aria-label={`${position} 番目の声色の名前`}
              aria-invalid={nameClash || undefined}
              aria-describedby={nameClash ? clashId : undefined}
              placeholder={voiceLabel("")}
              value={voice.name}
              onChange={(event) => onRename(event.target.value)}
              className={cx(
                "h-8 w-full select-text rounded-md border bg-surface-2 px-2.5 text-sm font-semibold text-1 placeholder:font-normal placeholder:text-2",
                nameClash ? "border-attention" : "border-line-strong",
              )}
            />
          )}
          {first && nameClash && (
            <p id={clashId} className="text-xs text-amber-12">
              {voice.name === ""
                ? "声色なしがほかにもあります。名前を付けてください"
                : "同じ名前の声色がほかにあります"}
            </p>
          )}
          {/*
           * 横並びの箱で包む。 縦の flex の子に直に置くと、`inline-flex` の群が列の幅まで
           * 引き伸ばされ、最後の項目の右に何も無い面が残る。
           */}
          <div className="flex">
            <Segment
              aria-label={`${label} の方式`}
              size="sm"
              value={lane.method}
              onValueChange={onMethod}
              options={SETUP_METHODS.map((m) => ({ value: m, label: methodName(m) }))}
            />
          </div>
          {(below.length > 0 || above.length > 0) && (
            <div className="flex gap-1">
              {below.length > 0 && (
                <Hidden side="left" tones={below} onReveal={() => onReveal(below.at(-1) ?? 0)} />
              )}
              {above.length > 0 && (
                <Hidden side="right" tones={above} onReveal={() => onReveal(above[0] ?? 0)} />
              )}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 px-8">
          <LaneKeyboard
            label={label}
            range={range}
            view={view}
            selected={lane.tones}
            onToggle={onToggle}
            shiftButtons={false}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Menu>
            <MenuTrigger>
              <Button ref={menuRef} variant="ghost" size="icon-sm" aria-label={`${label} の操作`}>
                <Icon name="kebab" size={14} />
              </Button>
            </MenuTrigger>
            <MenuContent onCloseAutoFocus={onMenuClosed}>
              <MenuItem onSelect={onAdd}>追加</MenuItem>
              <MenuItem onSelect={onDuplicate}>複製</MenuItem>
              <MenuItem tone="danger" onSelect={onRemove}>
                削除
              </MenuItem>
            </MenuContent>
          </Menu>
          {/*
           * 1本だけならレーンのつまみを出さない。 右に声色のつまみが並び、どちらを掴めば
           * よいか分からなくなる。 席は空けておく——詰めると帯ごとに鍵盤の幅が変わり、
           * 縦に並ぶはずの同じ音階がずれる。
           */}
          {alone ? (
            <span aria-hidden="true" className="w-6 shrink-0" />
          ) : (
            <Grip {...grip} span="lane" label={`${label} を並べ替える`} />
          )}
        </div>
      </div>
      {empty && <p className="pl-66 text-xs text-amber-12">音階を選んでいません</p>}
      {clash !== undefined && <p className="pl-66 text-xs text-amber-12">{clashNote(clash)}</p>}
    </li>
  );
};

/**
 * 窓の外の選択。 いちばん近い音階を名前で出し、残りは数で言う。 押すとその音階まで送る。
 *
 * 向きは印（`Icon`）で描く。 「◂」のような字にしない——書体ごとに形が変わり、
 * ボードの線の印と並ぶと浮く（`~/components/icon` の冒頭）。
 */
const Hidden = ({
  side,
  tones,
  onReveal,
}: {
  side: "left" | "right";
  tones: readonly number[];
  onReveal: () => void;
}) => {
  const nearest = side === "left" ? tones.at(-1) : tones[0];
  const rest = tones.length - 1;
  return (
    <button
      type="button"
      onClick={(event) => {
        // 見えるようになった鍵へ焦点を移す。 最後の印なら押したこの印が消えて、焦点が
        // `body` へ落ちる。 何が見えるようになったのかも、焦点の先で分かる。
        // 窓を送る描画は押した出来事の中で済むので、次のフレームには鍵がある。
        const row = event.currentTarget.closest("[data-reorder-row]");
        onReveal();
        window.requestAnimationFrame(() => {
          row?.querySelector<HTMLElement>(`[data-midi="${nearest}"]`)?.focus();
        });
      }}
      className="flex h-6 items-center gap-1 rounded-md bg-surface-2 px-2 font-mono text-xs text-2 tabular-nums hover:text-1"
    >
      {side === "left" && <Icon name="back" size={10} />}
      <span className="sr-only">{side === "left" ? "左" : "右"}に隠れている音階 </span>
      {nearest === undefined ? "" : toneName(nearest)}
      {rest > 0 && <span className="font-sans"> ほか {rest}</span>}
      {side === "right" && <Icon name="forward" size={10} />}
    </button>
  );
};

/*
 * つまみの長さが、動かす範囲を言う。 声色は帯の高さいっぱい、レーンは鍵盤の高さ。
 * 的は線より広く取る（幅 24px、`TR-PLT-31`）。
 */
const grip = tv({
  variants: {
    span: {
      voice: "self-stretch py-3",
      lane: "h-14",
    },
  },
});

/**
 * 並べ替えのつまみ。 縦の細い線（iOS のシートの掴み手を縦にしたもの）。
 *
 * 点の印にしない。 隣の ⋮ と同じ点の並びになり、どちらが何かを形で見分けられない。
 *
 * 線は段 11。 線そのものが「ここを掴める」を示す唯一の手がかりなので、
 * 非テキストの 3:1 が要る（`TR-PLT-28`）。 境界の段（`line-strong`）では面に届かない。
 * 区切り線と取り違えないよう、掴める所に乗ったら段 12 へ濃くし、カーソルも掴む形にする。
 *
 * `Button` を使わない。 `draggable` と、Space を持ち上げに使う `onKeyDown` を持たせるため、
 * 押すと何かが走るボタンの見た目に寄せないほうがよい。
 */
const Grip = ({ label, span, ...props }: GripProps & { label: string; span: "voice" | "lane" }) => (
  <button
    type="button"
    aria-label={label}
    className={`group flex w-6 shrink-0 cursor-grab justify-center rounded-md hover:bg-surface-2 data-[lifted]:relative data-[lifted]:z-30 data-[lifted]:bg-surface-3 ${grip({ span })}`}
    {...props}
  >
    <span
      aria-hidden="true"
      className="h-full w-1 rounded-full bg-slate-11 group-hover:bg-slate-12 group-data-[lifted]:bg-slate-12"
    />
  </button>
);
