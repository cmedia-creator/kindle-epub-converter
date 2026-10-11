// 見出し（章タイトル）の判定。誤判定で本文を分割しないよう、条件は保守的にする。

const NUM = '[0-9０-９一二三四五六七八九十百千〇零壱弐参]+';
const SEP = '[ 　:：.．、・\\-－―─]';

const PATTERNS: RegExp[] = [
  // 第一章 / 第1話 / 第三部　タイトル / 1章
  new RegExp(`^(?:第${NUM}[章話部節幕編回]|${NUM}[章話])(?:${SEP}+.{0,30})?$`),
  // 序章・終章・プロローグなど
  new RegExp(
    `^(?:序章|終章|間章|幕間|プロローグ|エピローグ|インターミッション|まえがき|あとがき|はじめに|おわりに|前書き|後書き|Prologue|Epilogue|Chapter\\s*\\d+)(?:${SEP}+.{0,30})?$`,
    'i',
  ),
];

/** Markdown 形式の見出し（# 見出し） */
const MD_HEADING = /^([#＃]{1,3})[ 　]+(\S.*)$/;

export interface HeadingHit {
  level: number;
  /** 見出しとして表示するテキスト（Markdown 記号を除いたもの） */
  text: string;
  /** Markdown 記号を取り除いたか */
  markdown: boolean;
}

export function detectHeading(line: string): HeadingHit | null {
  const s = line.trim();
  if (s.length === 0 || s.length > 40) return null;
  const md = MD_HEADING.exec(s);
  if (md) return { level: md[1].length, text: md[2], markdown: true };
  if (/[。」』]$/.test(s) || /^[「『（(]/.test(s)) return null;
  for (const re of PATTERNS) if (re.test(s)) return { level: 1, text: line, markdown: false };
  return null;
}
