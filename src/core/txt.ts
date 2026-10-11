import type { Block, Book } from './model';
import { applyRubyNotation, stripInvalidXml } from './inline';
import { detectHeading } from './headings';

export interface Decoded {
  text: string;
  encoding: string;
  lossy: boolean;
}

function tryDecode(bytes: Uint8Array, enc: string): string | null {
  try {
    return new TextDecoder(enc, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function japaneseScore(s: string): number {
  const m = s.match(/[぀-ヿ一-鿿。、]/g);
  return m ? m.length : 0;
}

/** 文字コードを判定してデコードする（BOM → UTF-8 → Shift_JIS → EUC-JP） */
export function decodeText(bytes: Uint8Array): Decoded {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 (BOM付き)', lossy: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16LE', lossy: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16BE', lossy: false };

  const utf8 = tryDecode(bytes, 'utf-8');
  if (utf8 !== null) return { text: utf8, encoding: 'UTF-8', lossy: false };

  const candidates: { enc: string; label: string; text: string }[] = [];
  for (const [enc, label] of [
    ['shift_jis', 'Shift_JIS'],
    ['euc-jp', 'EUC-JP'],
  ]) {
    const t = tryDecode(bytes, enc);
    if (t !== null) candidates.push({ enc, label, text: t });
  }
  if (candidates.length) {
    candidates.sort((a, b) => japaneseScore(b.text) - japaneseScore(a.text));
    return { text: candidates[0].text, encoding: candidates[0].label, lossy: false };
  }
  // どの文字コードでも完全には読めない：最も日本語らしいものを採用し、警告する
  const loose = ['utf-8', 'shift_jis', 'euc-jp']
    .map((enc) => ({ enc, text: new TextDecoder(enc).decode(bytes) }))
    .sort((a, b) => japaneseScore(b.text) - japaneseScore(a.text))[0];
  return { text: loose.text, encoding: loose.enc, lossy: true };
}

/** 改行を統一し、前後の空行を除いた行配列にする（本文検証でも同じ関数を使う） */
export function normalizeLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

export function parseTxt(bytes: Uint8Array, title: string): Book {
  const warnings: string[] = [];
  const dec = decodeText(bytes);
  if (dec.lossy)
    warnings.push(
      `文字コードを判定できませんでした（${dec.encoding} として読み込み）。文字化けしている可能性があります。UTF-8 で保存し直すと確実です。`,
    );
  const { text, removed } = stripInvalidXml(dec.text);
  if (removed > 0) warnings.push(`EPUB に使えない制御文字を ${removed} 個 取り除きました。`);

  const blocks: Block[] = [];
  let rubyCount = 0;
  let mdHeadings = 0;
  for (const line of normalizeLines(text)) {
    const h = detectHeading(line);
    const r = applyRubyNotation([{ t: 'text', text: h ? h.text : line }]);
    rubyCount += r.count;
    if (h) {
      if (h.markdown) mdHeadings++;
      blocks.push({ kind: 'h', level: h.level, inl: r.inl });
    } else blocks.push({ kind: 'p', inl: r.inl });
  }
  if (mdHeadings) warnings.push(`「#」で始まる行 ${mdHeadings} 行を見出しとして扱い、「#」記号を外しました。`);
  return { title, blocks, warnings, encoding: dec.encoding, rubyCount };
}
