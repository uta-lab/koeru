import { type KeyboardEvent, useId, useMemo, useState } from "react";

import { Chip } from "~/components/chip";
import { Field } from "~/components/field";

/** 綴りの表示状態。 1つの綴りが同じ回で「未読 → 編集済み」のように移る。 */
export type AliasStatus = "unread" | "confirmed" | "edited";

/** 左の一覧の行1つ。 鍵は `(行, 綴り)` を Rust 側が1つに畳んだもの（`TR-ALN-26`）。 */
export type AliasRow = {
  /** 選んだときに `onSelect` へ渡る鍵。 中央の確認面はこれで何を見るかを決める。 */
  key: string;
  alias: string;
  /** 0〜1 の確信度。 Rust 側が `null` を 0 に写して渡す。 */
  confidence: number;
  status: AliasStatus;
  /**
   * 編集済みのときの、元の確信度（取り消し線で見せる）。
   * `unread` と `confirmed` では参照しない。
   */
  originalConfidence?: number;
};

type AliasListProps = {
  aliases: readonly AliasRow[];
  /** 選んでいる綴り。 一覧に無くても握る——絞り込みを変えても中央は残す。 */
  selected: string | null;
  onSelect: (key: string) => void;
};

/** 確信度の並べ替えの状態。 初期は `none` で、渡された順をそのまま出す。 */
type Sort = "none" | "asc" | "desc";

/**
 * S08 原音設定の左の列（`TR-ALN-26`、`TR-ALN-30`）。
 *
 * 検索・未読の絞り込み・確信度の並べ替えを持つ。選んだ綴りは中央の
 * 確認面が扱う（部品の外へ `onSelect` で返す）。
 *
 * ショートカットのチップを出さない（`⌘F` など）。 Tab と Enter / Space、
 * 矢印キーで動かせる（`TR-PLT-25`）。
 *
 * 色だけで言わない（`docs/reports/ux/direction.md`）。 未読は点と
 * 「未読」の読み上げ、編集済みは字で言う。
 *
 * サブバンクの絞り込みを持たない。 どの枠のエイリアスかはパンくずが
 * 決め、置く側が `aliases` を渡す。ここで二重に状態を持つと食い違う。
 */
export const AliasList = ({ aliases, selected, onSelect }: AliasListProps) => {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  // 初期は「もとの並び」。 昇順 / 降順の2値に閉じると、開いた瞬間に
  // 何かの軸で並んでいることになり、Rust 側の意味のある順を潰す。
  const [sort, setSort] = useState<Sort>("none");
  // roving tabindex の `0` が立つ行。 選んだ行とは別に持つ——矢印は焦点を
  // 動かすだけで、選ばれる的は Enter / Space を押すまで替わらない。
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const unreadCount = useMemo(() => aliases.filter((a) => a.status === "unread").length, [aliases]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = aliases.filter((a) => {
      if (unreadOnly && a.status !== "unread") return false;
      if (q !== "" && !a.alias.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "none") return filtered;
    const sign = sort === "asc" ? 1 : -1;
    return [...filtered].sort((x, y) => (x.confidence - y.confidence) * sign);
  }, [aliases, query, unreadOnly, sort]);

  const entryKey = shown.some((a) => a.key === focusKey)
    ? focusKey
    : shown.some((a) => a.key === selected)
      ? selected
      : (shown[0]?.key ?? null);

  const cycleSort = () => setSort((s) => (s === "none" ? "asc" : s === "asc" ? "desc" : "none"));

  const ariaSort = sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none";
  const sortMark = sort === "asc" ? "↑" : sort === "desc" ? "↓" : "";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, key: string) => {
    const here = event.currentTarget;
    // 兄弟は `role="row"` の兄弟。 見出し行は親の中で別の `div` に置くので、
    // ここからは隣接しない（Up で見出しへ入らない）。
    const next: Record<string, Element | null | undefined> = {
      ArrowDown: here.nextElementSibling,
      ArrowUp: here.previousElementSibling,
      Home: here.parentElement?.firstElementChild,
      End: here.parentElement?.lastElementChild,
    };
    if (event.key === "Enter" || event.key === " ") {
      // Space の既定は一覧の縦送り。 止めないと押すたびに表の底まで飛ぶ。
      event.preventDefault();
      onSelect(key);
      return;
    }
    if (event.key in next) {
      event.preventDefault();
      (next[event.key] as HTMLElement | null | undefined)?.focus();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Field
        id={searchId}
        label="エイリアスを探す"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="か"
      />

      <div className="flex flex-wrap gap-2">
        <Chip pressed={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
          未読 <span className="font-mono tabular-nums">{unreadCount}</span>
        </Chip>
      </div>

      <div
        role="grid"
        aria-label="綴りの一覧"
        aria-rowcount={shown.length + 1}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div
          role="row"
          aria-rowindex={1}
          className="flex h-9 shrink-0 items-center gap-2 border-slate-7 border-b px-3 text-xs text-slate-11"
        >
          <span role="columnheader" className="flex-1">
            エイリアス
          </span>
          <div role="columnheader" aria-sort={ariaSort}>
            <button
              type="button"
              onClick={cycleSort}
              className="font-mono text-slate-12 tabular-nums focus-visible:-outline-offset-2"
            >
              確信度 {sortMark}
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <p
            // 空のメッセージは表の行ではない。 grid の中に置くと軸の数と
            // 合わなくなるので `role="presentation"` で外す。
            role="presentation"
            className="px-3 py-3 text-sm text-slate-11"
          >
            {query.trim() === "" && !unreadOnly
              ? "この枠に綴りはありません。"
              : "この絞り込みに当たる綴りはありません。"}
          </p>
        ) : (
          shown.map((row, i) => {
            const sel = row.key === selected;
            const focus = row.key === entryKey;
            return (
              <div
                key={row.key}
                role="row"
                aria-selected={sel}
                aria-rowindex={i + 2}
                tabIndex={focus ? 0 : -1}
                onClick={() => {
                  setFocusKey(row.key);
                  onSelect(row.key);
                }}
                onFocus={() => setFocusKey(row.key)}
                onKeyDown={(e) => onKeyDown(e, row.key)}
                className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 focus-visible:-outline-offset-2 ${
                  sel ? "bg-slate-4 text-slate-12" : "text-slate-12 hover:bg-slate-3"
                }`}
              >
                <span role="gridcell" className="flex min-w-0 flex-1 items-center gap-2">
                  {row.status === "unread" ? (
                    <>
                      <span aria-hidden="true" className="text-slate-11">
                        •
                      </span>
                      <span className="sr-only">未読</span>
                    </>
                  ) : (
                    // 点が無いときも幅を取る。 読んでいる綴りの頭が左右に揺れない。
                    <span aria-hidden="true" className="w-3 shrink-0" />
                  )}
                  <span className="select-text truncate text-sm">{row.alias}</span>
                </span>

                <span role="gridcell" className="flex items-center gap-2">
                  {row.status === "edited" && (
                    <span className="text-xs text-slate-11">編集済み</span>
                  )}
                  <span className="font-mono text-sm text-slate-12 tabular-nums">
                    {row.confidence.toFixed(2)}
                  </span>
                  {row.status === "edited" && row.originalConfidence !== undefined && (
                    <span className="font-mono text-xs text-slate-11 tabular-nums line-through">
                      {row.originalConfidence.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
