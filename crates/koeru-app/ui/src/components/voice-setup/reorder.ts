import {
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * いまドラッグしているもの。 声色の並べ替えとレーンの並べ替えで1つを共有する。
 *
 * `dataTransfer` に入れない。 `dragover` のあいだは中身を読めない（種類しか見えない）ので、
 * どこへ落とせるかをその場で決められない。
 */
export type Dragging = {
  scope: string;
  id: string;
  origin: number;
  /**
   * `drop` が届いたか。 置いたかどうかは、これと `dropEffect` の両方で決める（`onDragEnd`）。
   * どちらか片方だけでは、WebKit で置いたはずの並びを元に戻してしまうことがある。
   */
  dropped: boolean;
} | null;

/** 端からこの距離（CSS ピクセル）に入ったら、ドラッグ中に箱を送る。 */
const EDGE_PX = 48;

/**
 * スクロールする箱。 画面は `body` を固定し、画面ごとの箱（`overflow-y-auto`）で送る。
 * 見つからなければ文書そのもの。
 */
const scrollerOf = (element: HTMLElement): HTMLElement => {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if ((overflowY === "auto" || overflowY === "scroll") && at.scrollHeight > at.clientHeight) {
      return at;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
};

type ReorderOptions = {
  /** 並べ替えの範囲。 声色なら1つ、レーンなら声色ごとに1つ。 範囲の外へは落とせない。 */
  scope: string;
  /** 並んでいる順の id。 */
  ids: readonly string[];
  onMove: (from: number, to: number) => void;
  /** 読み上げに使う名前。 */
  labelOf: (id: string) => string;
  /** 読み上げる。 置く側の live region へ流す。 */
  announce: (message: string) => void;
  dragging: RefObject<Dragging>;
};

/**
 * つまみで並べ替える。
 *
 * マウスはブラウザ標準のドラッグ。 `tauri.conf.json` の `dragDropEnabled` が `false` なので、
 * アプリの中でもそのまま効く（`true` だと Windows で OS 側に取られる）。
 *
 * 行き先はポインタの縦の位置だけで決める。 行の上に乗っているかを見ると、表の外や
 * 鍵盤の送りの上へ横に外れたとたんに止まる。 ドラッグのあいだはページ全体で
 * `dragover` を受け、掴んでいない行のうち縦の真ん中がポインタより上にある数を
 * 行き先にする。 範囲の上下へ出たら端に留まる。
 *
 * キーボードは、つまみに焦点を当てて Space で持ち上げ、↑↓ で動かし、Space で置く。
 * Esc で元の位置へ戻す。 画面全体に効くショートカットではなく、焦点が当たった部品の操作。
 * 持ち上げたまま焦点が外れたら、そこに置く。
 *
 * 動かしたあとは、動かしたもののつまみへ焦点を戻す。 React が DOM を並べ替えるとき、
 * 焦点のある要素を外して入れ直すことがあり、そうなると焦点が `body` へ落ちる。
 */
export const useReorder = ({ scope, ids, onMove, labelOf, announce, dragging }: ReorderOptions) => {
  /** キーボードで持ち上げているもの。 `origin` は Esc で戻す先。 */
  const [lifted, setLifted] = useState<{ id: string; origin: number } | null>(null);
  /** マウスで掴んでいるもの。 影を描くためだけに持つ（落とせるかの判定は `dragging`）。 */
  const [held, setHeld] = useState<string | null>(null);
  const holding = useRef<number | undefined>(undefined);
  const grips = useRef(new Map<string, HTMLButtonElement>());
  const rows = useRef(new Map<string, HTMLElement>());
  /** ページ全体で受ける口。 ドラッグの始めに付け、終わりに外す。 */
  const listening = useRef<{
    over: (e: globalThis.DragEvent) => void;
    drop: (e: Event) => void;
  } | null>(null);
  /**
   * いまの並びと動かし方。 ページ全体の口はドラッグの始めに作るので、そのときの値を
   * 閉じ込めると、1回動かしたあとは古い並びで行き先を数えてしまう。
   */
  const latest = useRef({ ids, onMove });
  useLayoutEffect(() => {
    latest.current = { ids, onMove };
  });

  const stopListening = () => {
    const current = listening.current;
    if (current === null) return;
    document.removeEventListener("dragover", current.over);
    document.removeEventListener("drop", current.drop, true);
    listening.current = null;
  };
  useEffect(
    () => () => {
      stopListening();
      window.clearTimeout(holding.current);
    },
    [],
  );

  /**
   * ポインタの縦の位置から行き先を決めて動かす。 掴んでいない行のうち、縦の真ん中が
   * ポインタより上にある数が行き先になる。
   */
  const follow = (id: string, clientY: number) => {
    const { ids: order, onMove: move } = latest.current;
    const from = order.indexOf(id);
    let to = 0;
    for (const other of order) {
      if (other === id) continue;
      const box = rows.current.get(other)?.getBoundingClientRect();
      if (box !== undefined && box.top + box.height / 2 < clientY) to += 1;
    }
    if (from >= 0 && to !== from) move(from, to);
  };

  const startListening = (from: HTMLElement) => {
    stopListening();
    const scroller = scrollerOf(from);
    const over = (event: globalThis.DragEvent) => {
      const current = dragging.current;
      if (current === null || current.scope !== scope) return;
      // どこで離しても置けるようにする。 離した所が行の外でも、行き先はもう決まっている。
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
      /*
       * 端に近づいたら箱を送る。 WebKit（macOS の WKWebView）は、ドラッグ中に箱の端へ
       * 寄せても自分では送らない（Chromium は送る）。 送らないと、見えていない所へ運べない。
       * 端に近いほど速く送る。 `dragover` はポインタが止まっていても繰り返し届く。
       */
      const box =
        scroller === document.scrollingElement
          ? { top: 0, bottom: window.innerHeight }
          : scroller.getBoundingClientRect();
      if (event.clientY < box.top + EDGE_PX) {
        scroller.scrollBy(0, -(box.top + EDGE_PX - event.clientY) / 2);
      } else if (event.clientY > box.bottom - EDGE_PX) {
        scroller.scrollBy(0, (event.clientY - (box.bottom - EDGE_PX)) / 2);
      }
      follow(current.id, event.clientY);
    };
    // 名前の欄の上で離すと、運んでいる字（`setData` の名前）が欄に入る。 既定の動きを止める。
    const drop = (event: Event) => {
      const current = dragging.current;
      if (current?.scope !== scope) return;
      event.preventDefault();
      current.dropped = true;
      // 離した所でもう一度決める。 `dragover` は間引かれることがあり（WebKit で見た）、
      // 最後に届いた位置が離した位置とは限らない。
      follow(current.id, (event as globalThis.DragEvent).clientY);
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop, true);
    listening.current = { over, drop };
  };
  const refocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (refocus.current === null) return;
    grips.current.get(refocus.current)?.focus();
    // 焦点が外れずに残った場合は `focus()` が何もしないので、見える所まで送るのは別に頼む。
    // 送らないと、↓ で運んだ行が箱の外へ出て、どこにいるか見えなくなる。 下に固定した段の
    // 裏へ隠れないよう、行は `scroll-mb-28` で段の高さぶんの余白を取って送られる。
    rows.current.get(refocus.current)?.scrollIntoView({ block: "nearest" });
    refocus.current = null;
  });

  const place = (id: string) => `${labelOf(id)}、${ids.indexOf(id) + 1} 番目`;

  const step = (id: string, direction: -1 | 1) => {
    const from = ids.indexOf(id);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    refocus.current = id;
    onMove(from, to);
    announce(`${labelOf(id)}、${to + 1} 番目`);
  };

  const grip = (id: string) => ({
    ref: (element: HTMLButtonElement | null) => {
      if (element === null) grips.current.delete(id);
      else grips.current.set(id, element);
    },
    draggable: true,
    onDragStart: (event: DragEvent<HTMLButtonElement>) => {
      dragging.current = { scope, id, origin: ids.indexOf(id), dropped: false };
      startListening(event.currentTarget);
      // 影は次の描画で付ける。 ここで付けると、ブラウザがドラッグ中の絵を撮る前に
      // 描き変わり、ポインタに付いてくる絵まで影になる。
      holding.current = window.setTimeout(() => setHeld(id), 0);
      event.dataTransfer.effectAllowed = "move";
      // 何か入れておかないと、Firefox はドラッグを始めない。
      event.dataTransfer.setData("text/plain", labelOf(id));
      // 絵の中でも、つまんだ所（つまみ）がポインタの下に来るようにする。
      // 左上で持つと、右端のつまみを掴んだのに絵が右へずれて見える。
      const row = event.currentTarget.closest<HTMLElement>("[data-reorder-row]");
      if (row !== null) {
        const box = row.getBoundingClientRect();
        event.dataTransfer.setDragImage(row, event.clientX - box.left, event.clientY - box.top);
      }
    },
    /*
     * ドラッグのあいだに並べ替えているので、落とさずに終わったら（Esc や、窓の外で離した）
     * 持ち上げた位置へ戻す。 戻さないと、取り消したつもりの並びが残る。
     */
    onDragEnd: (event: DragEvent<HTMLButtonElement>) => {
      const current = dragging.current;
      dragging.current = null;
      stopListening();
      // 影を付ける予約がまだ走っていなければ取り消す。 すぐ取り消されたドラッグのあとに
      // 影だけが残り、鍵盤を覆ったままになる。
      window.clearTimeout(holding.current);
      setHeld(null);
      if (current?.id !== id) return;
      /*
       * 置いたかどうかは、`drop` が届いたか、`dropEffect` が `none` でないかのどちらかで決める。
       * どちらか片方だけでは足りない。 WebKit は受け入れた落としでも `dropEffect` に `none` を
       * 返すことがあり、`drop` そのものが届かないこともある（どちらも Playwright の WebKit で見た）。
       * 取り消しとみなすのは、両方が「置いていない」と言うときだけ（Esc、窓の外で離した）。
       */
      const placed = current.dropped || event.dataTransfer.dropEffect !== "none";
      // `drop` が届かずに置かれたなら、離した位置で決め直す。 Firefox は `dragend` の位置を
      // 0 で返すので、そのときは途中で決まった所のままにする。
      if (placed && !current.dropped && (event.clientX !== 0 || event.clientY !== 0)) {
        follow(id, event.clientY);
      }
      const from = ids.indexOf(id);
      if (!placed) {
        if (from !== current.origin) onMove(from, current.origin);
        announce(`${labelOf(id)} を元の位置に戻しました`);
      } else {
        announce(`${place(id)}に置きました`);
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === " ") {
        event.preventDefault();
        if (lifted?.id === id) {
          setLifted(null);
          announce(`${place(id)}に置きました`);
        } else {
          setLifted({ id, origin: ids.indexOf(id) });
          announce(`${place(id)}。上下の矢印で動かし、Space で置きます。Esc で戻します`);
        }
        return;
      }
      if (lifted?.id !== id) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        step(id, event.key === "ArrowUp" ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        const from = ids.indexOf(id);
        if (from !== lifted.origin) {
          refocus.current = id;
          onMove(from, lifted.origin);
        }
        setLifted(null);
        announce(`${labelOf(id)} を元の位置に戻しました`);
      }
    },
    // Space の keyup が click を起こす。 押しても何もしない的にしておく。
    onClick: (event: { preventDefault: () => void }) => event.preventDefault(),
    onBlur: () => {
      if (lifted?.id === id && refocus.current !== id) setLifted(null);
    },
    "data-lifted": lifted?.id === id || undefined,
  });

  /** 並んでいる行。 行き先を数えるために、それぞれの位置を測る。 */
  const row = (id: string) => ({
    ref: (element: HTMLElement | null) => {
      if (element === null) rows.current.delete(id);
      else rows.current.set(id, element);
    },
    "data-reorder-row": true,
    /*
     * 動かしている行。 並べ替えはドラッグ中にその場で起きているので、この行がいる所が
     * そのまま置かれる所になる。 灰色1色の影として描けば、離す前に行き先が見える。
     *
     * 影は中身の上に重ねる面（`after:`）で描く。 黒鍵が `z-10` を持つので、影はその上の
     * `z-20` に置き、行を `isolate` で閉じる——閉じないと、表全体に重ねた鍵盤の送りまで覆う。
     * キーボードで持ち上げているときは、焦点のあるつまみだけを影の上（`z-30`）に出す。
     * 隠すと焦点の位置が見えなくなる。
     */
    "data-moving": held === id || lifted?.id === id || undefined,
  });

  return { grip, row };
};
