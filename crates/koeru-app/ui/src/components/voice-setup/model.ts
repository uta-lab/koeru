import type { RecordingMethod } from "~/lib/ipc";
import { toneName } from "~/lib/tones";

import { NO_VOICE_COLOR, methodName } from "~/components/app-shell/subbank";

/**
 * 表で選べる方式。 枠は多音階を名乗らない（`RecordingMethod` の doc）ので、
 * 多音階の連続音は並べない。
 */
export type SetupMethod = Exclude<RecordingMethod, "MULTI_PITCH_SEQUENTIAL">;

/** 並べる順。 ボード（S02）の左から。 */
export const SETUP_METHODS: readonly SetupMethod[] = ["SINGLE", "SEQUENTIAL", "CVVC"];

/** 新しい声色の最初のレーンの方式。 ボード（P4b）の「＋ 枠」と同じ。 */
export const DEFAULT_METHOD: SetupMethod = "CVVC";

/** 声色の中の1本。 方式を1つ持ち、鍵盤で選んだ音階の1つずつが枠になる。 */
export type Lane = {
  id: string;
  method: SetupMethod;
  /** 低い順。 */
  tones: readonly number[];
};

/**
 * 名前でまとめたレーン。 名前は打ったとおりに持つ——空白も大文字小文字も揃えない。
 * Rust が同じ綴りを同じ声色として比べるので（`VoiceColor` の doc）、ここも揃えると、
 * 画面では重ならないのに作るときに重なる、が起きる。
 */
export type Voice = {
  id: string;
  /** 空なら声色なし。 */
  name: string;
  lanes: readonly Lane[];
};

/** 枠1つ。 表の上から順に並べたもの。 */
export type Frame = {
  voice: Voice;
  lane: Lane;
  tone: number;
};

export const voiceLabel = (name: string): string => (name === "" ? NO_VOICE_COLOR : name);

/** 「Whisper CVVC」。 鍵盤と操作の名前に使う。 */
export const laneLabel = (voice: Voice, lane: Lane): string =>
  `${voiceLabel(voice.name)} ${methodName(lane.method)}`;

/**
 * 声色の中のレーンの名前。 同じ方式のレーンが2本以上あれば、何本目かを足す
 * （「Whisper CVVC 2」）。 名前が同じだと、読み上げで ⋮ やつまみを見分けられない。
 */
export const laneLabelsOf = (voice: Voice): Map<string, string> => {
  const labels = new Map<string, string>();
  for (const lane of voice.lanes) {
    const same = voice.lanes.filter((l) => l.method === lane.method);
    const base = laneLabel(voice, lane);
    labels.set(lane.id, same.length > 1 ? `${base} ${same.indexOf(lane) + 1}` : base);
  }
  return labels;
};

// ## 組み替え
//
// どれも新しい配列を返す。 id は呼ぶ側が渡す——ここで作ると、story で同じ表を
// 二度作ったときに id が変わり、焦点の行き先を指せなくなる。

const mapLane = (voices: readonly Voice[], laneId: string, f: (lane: Lane) => Lane): Voice[] =>
  voices.map((voice) =>
    voice.lanes.some((l) => l.id === laneId)
      ? { ...voice, lanes: voice.lanes.map((l) => (l.id === laneId ? f(l) : l)) }
      : voice,
  );

/** 表の下に新しい声色を足す。 名前は空、レーンは1本で音階なし。 */
export const addVoice = (voices: readonly Voice[], voiceId: string, laneId: string): Voice[] => [
  ...voices,
  { id: voiceId, name: "", lanes: [{ id: laneId, method: DEFAULT_METHOD, tones: [] }] },
];

/**
 * 同じ声色の中、そのレーンのすぐ下に、同じ方式で音階の無いレーンを足す。
 *
 * 音階を写さない。 写すと足した瞬間に全部の鍵が重なり、足すたびに外す手間が要る。
 */
export const addLane = (voices: readonly Voice[], laneId: string, newLaneId: string): Voice[] =>
  voices.map((voice) => {
    const at = voice.lanes.findIndex((l) => l.id === laneId);
    const lane = voice.lanes[at];
    if (lane === undefined) return voice;
    const lanes = [...voice.lanes];
    lanes.splice(at + 1, 0, { id: newLaneId, method: lane.method, tones: [] });
    return { ...voice, lanes };
  });

/** 声色の最後にレーンを足す。 方式は最後のレーンと同じで、音階なし（`addLane` と同じ理由）。 */
export const appendLane = (voices: readonly Voice[], voiceId: string, newLaneId: string): Voice[] =>
  voices.map((voice) => {
    const last = voice.lanes.at(-1);
    if (voice.id !== voiceId || last === undefined) return voice;
    return { ...voice, lanes: [...voice.lanes, { id: newLaneId, method: last.method, tones: [] }] };
  });

/**
 * そのレーンだけを写した新しい声色を、元の声色のすぐ下に作る。 名前も写す。
 *
 * 名前が重なったままでは始められない（`problemsOf`）。 打ち直させるのは置く側で、
 * 名前の欄へ焦点を移す。
 */
export const duplicateLane = (
  voices: readonly Voice[],
  laneId: string,
  newVoiceId: string,
  newLaneId: string,
): Voice[] => {
  const at = voices.findIndex((v) => v.lanes.some((l) => l.id === laneId));
  const voice = voices[at];
  const lane = voice?.lanes.find((l) => l.id === laneId);
  if (voice === undefined || lane === undefined) return [...voices];
  const next = [...voices];
  next.splice(at + 1, 0, {
    id: newVoiceId,
    name: voice.name,
    lanes: [{ ...lane, id: newLaneId }],
  });
  return next;
};

/** レーンを消す。 声色の最後のレーンなら、声色ごと消える。 */
export const removeLane = (voices: readonly Voice[], laneId: string): Voice[] =>
  voices
    .map((voice) => ({ ...voice, lanes: voice.lanes.filter((l) => l.id !== laneId) }))
    .filter((voice) => voice.lanes.length > 0);

export const renameVoice = (voices: readonly Voice[], voiceId: string, name: string): Voice[] =>
  voices.map((voice) => (voice.id === voiceId ? { ...voice, name } : voice));

export const setMethod = (voices: readonly Voice[], laneId: string, method: SetupMethod): Voice[] =>
  mapLane(voices, laneId, (lane) => ({ ...lane, method }));

export const toggleTone = (voices: readonly Voice[], laneId: string, tone: number): Voice[] =>
  mapLane(voices, laneId, (lane) => ({
    ...lane,
    tones: lane.tones.includes(tone)
      ? lane.tones.filter((t) => t !== tone)
      : [...lane.tones, tone].sort((a, b) => a - b),
  }));

const move = <T>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...items];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
};

/** 声色を `from` 番目から `to` 番目へ。 並びは録る順の既定（`TR-RCL-28`）。 */
export const moveVoice = (voices: readonly Voice[], from: number, to: number): Voice[] =>
  move(voices, from, to);

/** 声色の中でレーンを動かす。 ほかの声色へは移さない——それは名前の付け替えになる。 */
export const moveLane = (
  voices: readonly Voice[],
  voiceId: string,
  from: number,
  to: number,
): Voice[] =>
  voices.map((voice) =>
    voice.id === voiceId ? { ...voice, lanes: move(voice.lanes, from, to) } : voice,
  );

// ## 読み

/** 枠を表の上から順に。 声色の順、レーンの順、音階の低い順。 */
export const framesOf = (voices: readonly Voice[]): Frame[] =>
  voices.flatMap((voice) =>
    voice.lanes.flatMap((lane) => lane.tones.map((tone) => ({ voice, lane, tone }))),
  );

/** 始めたときに最初に録る枠。 並びが録る順（ボード P4b の「行の並び＝収録順」）。 */
export const firstFrame = (voices: readonly Voice[]): Frame | undefined => framesOf(voices)[0];

/**
 * 始められない理由。
 *
 * 編集は止めない。 重なった状態も作れて、そのあいだは始めるのを止める——
 * 鍵を押せなくすると、別のレーンを直してから戻る、という順に縛られる。
 */
export type Problems = {
  /** 枠が1つも無い。 */
  empty: boolean;
  /**
   * 音階を1つも選んでいないレーン。 枠を持たないレーンは作っても録るものが無く、
   * 表には残るので、本人が選び忘れたのか要らないのかを決めさせる。
   */
  emptyLanes: ReadonlySet<string>;
  /** 名前が重なっている声色。 声色なしが2つある場合も含む。 */
  nameClashes: ReadonlySet<string>;
  /**
   * レーンごとに、(声色・方式・音階) の組が同じ声色の中のほかの枠と重なっている音階。
   *
   * 名前が同じ別の声色どうしの重なりは数えない。 名前の重なり（`nameClashes`）がもう
   * 止めていて、名前を直せば消える。 両方を出すと、複製しただけで注記が倍に並ぶ。
   */
  toneClashes: ReadonlyMap<string, readonly number[]>;
};

export const problemsOf = (voices: readonly Voice[]): Problems => {
  const byName = new Map<string, string[]>();
  for (const voice of voices) {
    byName.set(voice.name, [...(byName.get(voice.name) ?? []), voice.id]);
  }
  const nameClashes = new Set([...byName.values()].filter((ids) => ids.length > 1).flat());

  // 声色ごとに数える。 名前は数えるときに要らない——同じ声色の中では名前は1つ。
  const keyOf = (f: Frame) => `${f.voice.id}\u0000${f.lane.method}\u0000${f.tone}`;
  const frames = framesOf(voices);
  const counts = new Map<string, number>();
  for (const frame of frames) counts.set(keyOf(frame), (counts.get(keyOf(frame)) ?? 0) + 1);
  const toneClashes = new Map<string, number[]>();
  for (const frame of frames) {
    if ((counts.get(keyOf(frame)) ?? 0) < 2) continue;
    toneClashes.set(frame.lane.id, [...(toneClashes.get(frame.lane.id) ?? []), frame.tone]);
  }

  const emptyLanes = new Set(
    voices.flatMap((v) => v.lanes.filter((l) => l.tones.length === 0).map((l) => l.id)),
  );

  return { empty: frames.length === 0, emptyLanes, nameClashes, toneClashes };
};

/** ボタンの横に並べる字。 空なら始められる。 */
export const reasonsOf = (voices: readonly Voice[], problems: Problems): string[] => {
  const reasons: string[] = [];
  // 枠が1つも無いときは、空のレーンの理由を重ねない。 言っていることが同じになる。
  if (problems.empty) reasons.push("音階を1つ以上選んでください");
  else if (problems.emptyLanes.size > 0) reasons.push("音階を選んでいないレーンがあります");
  const names = [
    ...new Set(voices.filter((v) => problems.nameClashes.has(v.id)).map((v) => v.name)),
  ];
  // 声色なしの重なりは、名前を付ければ直る。 「同じ名前」と言っても、名前が無いので伝わらない。
  const unnamed = voices.filter((v) => v.name === "").length;
  if (names.includes("")) {
    reasons.push(
      unnamed === 2
        ? "声色なしが2つあります。どちらかに名前を付けてください"
        : `声色なしが${unnamed}つあります。1つを残して名前を付けてください`,
    );
  }
  const named = names.filter((name) => name !== "");
  if (named.length > 0) reasons.push(`同じ名前の声色があります（${named.join("、")}）`);
  if (problems.toneClashes.size > 0) reasons.push("同じ声色に、方式と音階が同じ枠があります");
  return reasons;
};

/** レーンの下に出す字。 どの鍵が重なっているかを音名で言う（MIDI 番号は出さない、`TR-REC-25`）。 */
export const clashNote = (tones: readonly number[]): string =>
  `${[...new Set(tones)].map(toneName).join("・")} がほかの枠と同じ組です`;
