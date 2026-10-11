// 変換の中間表現。入力形式（TXT / DOCX）に依存しない。

export interface Marks {
  b?: boolean; // 太字
  i?: boolean; // 斜体
  em?: boolean; // 傍点（圏点）
  u?: boolean; // 傍線（下線）
  s?: boolean; // 取り消し線
}

export type Inline =
  | { t: 'text'; text: string; m?: Marks }
  | { t: 'ruby'; base: string; rt: string; m?: Marks }
  | { t: 'br' };

export type Block =
  | { kind: 'p'; inl: Inline[]; pageBreakBefore?: boolean }
  | { kind: 'h'; level: number; inl: Inline[]; pageBreakBefore?: boolean };

export interface Book {
  title: string;
  blocks: Block[];
  warnings: string[];
  /** 入力の文字コード（TXT のみ） */
  encoding?: string;
  /** 記法から変換したルビの数 */
  rubyCount: number;
}

export function inlineText(inl: Inline[]): string {
  let s = '';
  for (const n of inl) {
    if (n.t === 'text') s += n.text;
    else if (n.t === 'ruby') s += n.base;
    else s += '\n';
  }
  return s;
}

export function sameMarks(a?: Marks, b?: Marks): boolean {
  const k: (keyof Marks)[] = ['b', 'i', 'em', 'u', 's'];
  return k.every((x) => !!a?.[x] === !!b?.[x]);
}
