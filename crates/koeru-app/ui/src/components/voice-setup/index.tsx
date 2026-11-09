import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "~/components/button";
import { Field } from "~/components/field";
import { Icon } from "~/components/icon";
import { type ToneSpan, canShift, shiftSpan, snapSpan } from "~/components/lane-keyboard/geometry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/select";
import type { DeviceView } from "~/lib/ipc";
import { cx } from "~/lib/tv";

import {
  type Voice,
  addLane,
  addVoice,
  appendLane,
  duplicateLane,
  framesOf,
  moveLane,
  moveVoice,
  problemsOf,
  reasonsOf,
  removeLane,
  renameVoice,
  setMethod,
  toggleTone,
  voiceLabel,
} from "./model";
import { type Dragging, useReorder } from "./reorder";
import { VoiceGroup } from "./voice-group";

/** 選べる音階の範囲（C1〜B7）。 ボード P4c の「全サブバンクの音階を C1–B7 の帯に」。 */
const RANGE: ToneSpan = [24, 107];
/** 最初に見せる窓（C3〜C6）。 ボード S02 のまま。 */
const INITIAL_VIEW: ToneSpan = [48, 84];

/** 見積もり。 表全体の行数と時間（`TR-RCL-09`）。 足し合わせるのは置く側。 */
export type SetupEstimate = { rows: number; seconds: number };

type VoiceSetupProps = {
  /**
   * 音源名。 空（空白だけを含む）なら始められない。 前後の空白を削って見るのは、
   * 作る側（`create_project`）が同じ削り方で空の名前を弾くのにそろえるため。
   */
  name: string;
  onNameChange: (name: string) => void;
  voices: readonly Voice[];
  onVoicesChange: (voices: Voice[]) => void;
  /** まだ出せないなら `null`。 */
  estimate: SetupEstimate | null;
  devices: readonly DeviceView[];
  /** 前回のマイク。 選ばれていなければ `undefined`。 */
  deviceId: string | undefined;
  onDeviceChange: (id: string) => void;
  /** 「収録をはじめる」。 始められないときは押せないので、呼ばれた時点で表は通っている。 */
  onStart: () => void;
};

/** 秒を「約 3 時間 11 分」にする。 単位を省かない（`docs/reports/ux/direction.md`）。 */
const duration = (seconds: number): string => {
  const total = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `約 ${minutes} 分`;
  return minutes === 0 ? `約 ${hours} 時間` : `約 ${hours} 時間 ${minutes} 分`;
};

/**
 * 新しい音源の枠を並べる（S02、ボード `S02-Method.dc.html`）。
 *
 * 1つの声色が1つの帯で、その中にレーンが縦に並ぶ。 レーンは方式を1つ持ち、
 * 鍵盤で選んだ音階の1つずつが枠になる。 並びが録る順。
 *
 * 編集は止めない。 名前や組が重なっても作れて、そのあいだは「収録をはじめる」を
 * 押せなくし、横に理由を出す。 鍵を押せなくする（`LaneKeyboard` の `locked`）と、
 * 直す順番を縛ることになる。
 *
 * 値は全部置く側が持つ。 部品は表を描いて、組み替えた表を返すだけ。
 * 窓（見えている音階）だけはここが持つ——全レーンで同じ窓を共有し、外へ出す理由が無い。
 */
export const VoiceSetup = ({
  name,
  onNameChange,
  voices,
  onVoicesChange,
  estimate,
  devices,
  deviceId,
  onDeviceChange,
  onStart,
}: VoiceSetupProps) => {
  const nameId = useId();
  const headingId = useId();
  const reasonsId = useId();

  const [view, setView] = useState<ToneSpan>(INITIAL_VIEW);
  const [message, setMessage] = useState("");

  // 足すものの id。 部品の外へ出る値だが、何であるかは置く側が解釈しない。
  const prefix = useId();
  const seq = useRef(0);
  const nextId = () => {
    seq.current += 1;
    return `${prefix}${seq.current}`;
  };

  // ## 焦点の行き先
  //
  // 複製と削除は、押した ⋮ とは別の所へ焦点を移す。 移す先は描いたあとでないと
  // 無いので、覚えておいて描き終えたときに移す。
  //
  // 移せたと確かめてから忘れる。 メニューが閉じきるまでは、Radix が焦点を
  // メニューの中へ閉じ込めていて、外へ移しても引き戻される（複製で踏んだ）。
  // 引き戻されたら、メニューが閉じたときにもう一度移し、そこで必ず忘れる（`onMenuClosed`）。
  // 移す先が描かれなかったときもすぐ忘れる——覚えたままだと、あとで関係の無い描画の
  // たびに焦点を奪う。
  const names = useRef(new Map<string, HTMLInputElement>());
  const menus = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const pending = useRef<
    { to: "name"; voiceId: string } | { to: "menu"; laneId: string } | { to: "add" } | null
  >(null);
  const claimed = useRef(false);

  const moveFocus = () => {
    const target = pending.current;
    if (target === null) return;
    const element =
      target.to === "name"
        ? names.current.get(target.voiceId)
        : target.to === "menu"
          ? menus.current.get(target.laneId)
          : addButton.current;
    if (element === undefined || element === null) {
      pending.current = null;
      return;
    }
    element.focus();
    if (element instanceof HTMLInputElement) element.select();
    if (element.ownerDocument.activeElement === element) pending.current = null;
  };

  useLayoutEffect(moveFocus);

  const focusNext = (target: NonNullable<typeof pending.current>) => {
    pending.current = target;
    claimed.current = true;
  };

  /**
   * 読み上げる。 同じ文言が続くと読まれないので、一度空にしてから入れる。
   * 前の文言を待っているなら取り消す。 残すと、持ち上げてすぐ ↓ を押したときに、
   * 古い案内があとから読まれる。
   */
  const announcing = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(announcing.current), []);
  const announce = (text: string) => {
    window.clearTimeout(announcing.current);
    setMessage("");
    announcing.current = window.setTimeout(() => setMessage(text), 50);
  };

  const dragging = useRef<Dragging>(null);
  const voiceOrder = useReorder({
    scope: "voices",
    ids: voices.map((v) => v.id),
    onMove: (from, to) => onVoicesChange(moveVoice(voices, from, to)),
    labelOf: (id) => `声色 ${voiceLabel(voices.find((v) => v.id === id)?.name ?? "")}`,
    announce,
    dragging,
  });

  const problems = problemsOf(voices);
  const nameMissing = name.trim() === "";
  const reasons = [
    ...(nameMissing ? ["音源名を入れてください"] : []),
    ...reasonsOf(voices, problems),
  ];
  const frameCount = framesOf(voices).length;

  const remove = (laneId: string) => {
    // 消したレーンの次（無ければ前）の ⋮ へ。 何も残らなければ「＋ 声色を追加する」へ。
    const order = voices.flatMap((v) => v.lanes.map((l) => l.id));
    const at = order.indexOf(laneId);
    const next = order[at + 1] ?? order[at - 1];
    focusNext(next === undefined ? { to: "add" } : { to: "menu", laneId: next });
    onVoicesChange(removeLane(voices, laneId));
  };

  const duplicate = (laneId: string) => {
    const voiceId = nextId();
    focusNext({ to: "name", voiceId });
    onVoicesChange(duplicateLane(voices, laneId, voiceId, nextId()));
  };

  /** その音階が見える所まで、窓を1オクターブずつ送る。 送れなくなったら止める。 */
  const reveal = (tone: number) => {
    let next = view;
    const direction = tone < snapSpan(next)[0] ? -1 : 1;
    while (canShift(next, RANGE, direction)) {
      const [from, to] = snapSpan(next);
      if (tone >= from && tone <= to) break;
      next = shiftSpan(next, RANGE, direction);
    }
    setView(next);
  };

  const shiftButton = (direction: -1 | 1) => (
    <button
      type="button"
      aria-label={direction < 0 ? "鍵盤を左へ送る" : "鍵盤を右へ送る"}
      disabled={!canShift(view, RANGE, direction)}
      onClick={() => setView(shiftSpan(view, RANGE, direction))}
      className={cx(
        "absolute inset-y-0 z-10 flex w-6 items-center justify-center rounded-md bg-surface-2 text-2 enabled:hover:text-1 disabled:opacity-45",
        direction < 0 ? "left-62" : "right-29",
      )}
    >
      <Icon name={direction < 0 ? "back" : "forward"} size={14} />
    </button>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-110">
        <Field
          id={nameId}
          label="音源名"
          size="lg"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2 id={headingId} className="flex items-baseline gap-2 text-xl font-semibold text-1">
          サブバンク
          <span className="font-mono text-xs font-normal text-2 tabular-nums">{frameCount}</span>
        </h2>

        <div className="relative">
          {voices.length > 0 && shiftButton(-1)}
          {/*
           * 帯のあいだは中の行の間隔より広く取る。 帯の下端の「＋ レーンを追加する」が、
           * 次の帯の頭と近いと、どちらの声色に足すのかが読みにくい。
           */}
          <ol aria-labelledby={headingId} className="flex flex-col gap-5">
            {voices.map((voice, position) => (
              <VoiceGroup
                key={voice.id}
                position={position + 1}
                voice={voice}
                problems={problems}
                range={RANGE}
                view={view}
                voiceGrip={voiceOrder.grip(voice.id)}
                voiceRow={voiceOrder.row(voice.id)}
                dragging={dragging}
                announce={announce}
                onRename={(value) => onVoicesChange(renameVoice(voices, voice.id, value))}
                onMethod={(laneId, method) => onVoicesChange(setMethod(voices, laneId, method))}
                onToggle={(laneId, tone) => onVoicesChange(toggleTone(voices, laneId, tone))}
                onReveal={reveal}
                onAddLane={(laneId) => onVoicesChange(addLane(voices, laneId, nextId()))}
                onAppendLane={() => onVoicesChange(appendLane(voices, voice.id, nextId()))}
                onDuplicateLane={duplicate}
                onRemoveLane={remove}
                onMoveLane={(from, to) => onVoicesChange(moveLane(voices, voice.id, from, to))}
                nameRef={(element) => {
                  if (element === null) names.current.delete(voice.id);
                  else names.current.set(voice.id, element);
                }}
                menuRef={(laneId, element) => {
                  if (element === null) menus.current.delete(laneId);
                  else menus.current.set(laneId, element);
                }}
                onMenuClosed={(event) => {
                  if (!claimed.current) return;
                  claimed.current = false;
                  event.preventDefault();
                  moveFocus();
                  pending.current = null;
                }}
              />
            ))}
          </ol>
          {voices.length > 0 && shiftButton(1)}
        </div>

        <button
          ref={addButton}
          type="button"
          onClick={() => {
            // 足した声色の名前の欄へ。 名前を付けるのが次にすること——声色なしがもう
            // あれば、付けるまで始められない。 メニューを経ないので、閉じるのを待たない。
            const voiceId = nextId();
            pending.current = { to: "name", voiceId };
            onVoicesChange(addVoice(voices, voiceId, nextId()));
          }}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-sm text-2 hover:text-1"
        >
          <Icon name="plus" size={12} />
          声色を追加する
        </button>
      </section>

      {/*
       * 下の段は、表が長くなっても見えるところに留める（ボード S02 では窓の下端にある）。
       * `sticky` はいちばん近いスクロールの箱を基準にするので、画面がこの部品を
       * `overflow-y-auto` の箱に入れれば、そのまま箱の下端に張り付く。
       * 箱の下の余白は 0 にする。 `sticky` は余白の内側に張り付くので、余白のぶん
       * 下に隙間が空き、そこから下を通る表がのぞく（Storybook の `p-4` で見た）。
       * 地を塗る。 塗らないと、下を通る表が透けて字に重なる。 送りのボタン（`z-10`）より上。
       */}
      <div className="sticky bottom-0 z-40 flex flex-wrap items-center gap-4 border-t border-line bg-bg py-5">
        {estimate !== null && estimate.rows > 0 && (
          <p className="text-sm text-2">
            <span className="font-mono text-1 tabular-nums">{estimate.rows}</span> 行 ·{" "}
            {duration(estimate.seconds)}
          </p>
        )}
        {/*
         * 前回のマイクが今の一覧に無ければ（外した USB マイクなど）、選んでいないものとして出す。
         * 一覧に無い値を渡すと、Radix は札を空のまま描き、「マイクを選ぶ」も出ない。
         */}
        <Select
          value={devices.some((d) => d.id === deviceId) ? deviceId : ""}
          onValueChange={onDeviceChange}
          disabled={devices.length === 0}
        >
          <SelectTrigger size="sm" aria-label="入力デバイス">
            <span aria-hidden="true" className="flex text-2">
              <Icon name="mic" size={13} />
            </span>
            <SelectValue
              placeholder={devices.length === 0 ? "マイクがありません" : "マイクを選ぶ"}
            />
          </SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-4">
          {/*
           * 理由は変わるたびに読み上げる。 置き場は理由が無いときも DOM に置いておく——
           * 中身と一緒に挿し込むと、支援技術が変化として拾わない（`~/components/announcer`）。
           */}
          <div id={reasonsId} role="status">
            {reasons.length > 0 && (
              <ul className="flex flex-col items-end gap-0.5 text-xs text-amber-12">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
          {/*
           * `disabled` にしない。 `disabled` だと焦点が当たらず、横の理由（`aria-describedby`）が
           * 読まれない。 `aria-disabled` なら Tab で着いて理由を聞け、押しても何も起きない。
           */}
          <Button
            variant="primary"
            aria-disabled={reasons.length > 0 || undefined}
            aria-describedby={reasons.length > 0 ? reasonsId : undefined}
            onClick={() => {
              if (reasons.length === 0) onStart();
            }}
          >
            収録をはじめる
          </Button>
        </div>
      </div>

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </p>
    </div>
  );
};
