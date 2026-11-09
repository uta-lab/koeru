import type { ComponentProps } from "react";

import { tv } from "~/lib/tv";

/*
 * `lg` は画面の題を兼ねる欄。 新しい音源の音源名（S02）で、ボードでは見出しの代わりに
 * 置かれている。 字だけ大きくすると欄の高さと釣り合わないので、高さも一緒に変える。
 */
const input = tv({
  variants: {
    size: {
      md: "h-11 rounded-lg px-3 text-sm",
      lg: "h-13 rounded-xl px-4 text-xl font-semibold",
    },
  },
  defaultVariants: { size: "md" },
});

type FieldProps = Omit<ComponentProps<"input">, "className" | "type" | "size"> & {
  /** 見えている名札。`aria-label` にしない——見える字と読まれる字を揃える。 */
  label: string;
  /** 名札の下に置く一行。何を打てばよいかを書く。 */
  hint?: string;
  size?: "md" | "lg";
};

/**
 * 文字を打つところ。
 *
 * 名札を必ず持つ。 `placeholder` は名前にならない——打ちはじめた瞬間に
 * 消えるので、あとから「これは何の欄か」を確かめられない（`TR-PLT-29`）。
 *
 * 打った字は選べる。 `globals.css` が `user-select: none` を敷いているので、
 * 打つところと読ませる文章だけ個別に戻す。
 */
export const Field = ({ label, hint, id, size, ...props }: FieldProps) => (
  <div className="flex flex-col gap-2">
    <label className="text-xs text-slate-11" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      type="text"
      autoComplete="off"
      className={`w-full select-text border border-slate-7 bg-slate-3 text-slate-12 placeholder:text-slate-11 ${input({ size })}`}
      {...props}
    />
    {hint !== undefined && <p className="text-xs text-slate-11">{hint}</p>}
  </div>
);
