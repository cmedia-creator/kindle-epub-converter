import type { Inline, Marks } from './model';
import { sameMarks } from './model';

// XML 1.0 で使えない制御文字（TAB/LF/CR 以外の C0、U+FFFE/FFFF、孤立サロゲート）
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** XML に入れられない文字を除去し、除去数を返す */
export function stripInvalidXml(s: string): { text: string; removed: number } {
  let removed = 0;
  const text = s.replace(INVALID_XML, () => {
    removed++;
    return '';
  });
  return { text, removed };
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- ルビ記法（小説投稿サイトで一般的な形式） ----
//   ｜親文字《るび》  （縦棒は全角・半角どちらも可）
//   漢字《かんじ》     （直前の漢字の連続が親文字）
// 記法として成立しないものは一切変更せず、そのまま本文として残す。
const KANJI = '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF々〆〇ヶ]|[\\uD840-\\uD87F][\\uDC00-\\uDFFF]';
const RUBY_RE = new RegExp(
  `[｜|]([^｜|《》\\n]{1,30})《([^《》\\n]{1,30})》|((?:${KANJI})+)《([^《》\\n]{1,30})》`,
  'gu',
);

export function parseRubyNotation(text: string, m?: Marks): { nodes: Inline[]; count: number } {
  const nodes: Inline[] = [];
  let last = 0;
  let count = 0;
  for (const mt of text.matchAll(RUBY_RE)) {
    const idx = mt.index!;
    const base = mt[1] ?? mt[3];
    const rt = mt[2] ?? mt[4];
    if (idx > last) nodes.push({ t: 'text', text: text.slice(last, idx), m });
    nodes.push({ t: 'ruby', base, rt, m });
    count++;
    last = idx + mt[0].length;
  }
  if (last < text.length) nodes.push({ t: 'text', text: text.slice(last), m });
  return { nodes, count };
}

/** 隣接する同一書式のテキストを結合する */
export function mergeText(inl: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of inl) {
    const prev = out[out.length - 1];
    if (n.t === 'text' && n.text === '') continue;
    if (n.t === 'text' && prev?.t === 'text' && sameMarks(prev.m, n.m)) {
      out[out.length - 1] = { t: 'text', text: prev.text + n.text, m: prev.m };
    } else out.push(n);
  }
  return out;
}

/** テキストノードにルビ記法を適用する */
export function applyRubyNotation(inl: Inline[]): { inl: Inline[]; count: number } {
  let count = 0;
  const out: Inline[] = [];
  for (const n of mergeText(inl)) {
    if (n.t !== 'text') {
      out.push(n);
      continue;
    }
    const r = parseRubyNotation(n.text, n.m);
    count += r.count;
    out.push(...r.nodes);
  }
  return { inl: out, count };
}

// ---- 縦中横：縦書き中の半角数字（1〜2桁）と !! !? など ----
// 文字は変えず、span で囲むだけ。前後が半角英数字の場合（英単語・3桁以上の数字）は対象外。
const TCY_RE = /(?<![0-9A-Za-z.,])([0-9]{1,2}|[!?]{2})(?![0-9A-Za-z.,])/g;

function tcy(s: string): string {
  return esc(s).replace(TCY_RE, '<span class="tcy">$1</span>');
}

function wrapMarks(html: string, m?: Marks): string {
  if (!m) return html;
  if (m.em) html = `<span class="em-dot">${html}</span>`;
  if (m.u) html = `<span class="underline">${html}</span>`;
  if (m.s) html = `<span class="strike">${html}</span>`;
  if (m.i) html = `<i>${html}</i>`;
  if (m.b) html = `<b>${html}</b>`;
  return html;
}

export function inlineToXhtml(inl: Inline[]): string {
  let s = '';
  for (const n of inl) {
    if (n.t === 'br') s += '<br/>';
    else if (n.t === 'text') s += wrapMarks(tcy(n.text), n.m);
    else s += wrapMarks(`<ruby>${esc(n.base)}<rt>${esc(n.rt)}</rt></ruby>`, n.m);
  }
  return s;
}
