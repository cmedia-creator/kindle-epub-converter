import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import { convert, ConvertError, type ConvertResult } from '../src/core/convert';
import { extractLines } from '../src/core/verify';
import type { DomParserCtor } from '../src/core/docx';

const Parser = DOMParser as unknown as DomParserCtor;
const FIX = new URL('./fixtures/', import.meta.url);
const OUT = new URL('../out/', import.meta.url);
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, FIX)));
const run = (name: string) => convert(name, read(name), Parser, { uuid: '00000000-0000-4000-8000-000000000000', modified: new Date('2026-10-11T00:00:00Z') });

const results = new Map<string, ConvertResult>();
const VALID = readdirSync(FIX).filter((f) => /^(0|1)\d-/.test(f));

beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  for (const f of VALID) {
    const r = run(f);
    results.set(f, r);
    writeFileSync(new URL(f.replace(/\.[^.]+$/, '.epub'), OUT), r.epub);
  }
});

const allText = (r: ConvertResult) => r.contentDocs.flatMap((d) => extractLines(d.xhtml, Parser)).join('\n');
const allXhtml = (r: ConvertResult) => r.contentDocs.map((d) => d.xhtml).join('\n');

describe('全ての正常系原稿', () => {
  it.each(VALID)('%s：本文照合が一致する', (f) => {
    const r = results.get(f)!;
    expect(r.verify.ok, r.verify.detail).toBe(true);
    expect(r.warnings.filter((w) => w.includes('不一致'))).toEqual([]);
  });

  it.each(VALID)('%s：EPUB の基本構造', (f) => {
    const r = results.get(f)!;
    const z = unzipSync(r.epub);
    const names = Object.keys(z);
    expect(names[0]).toBe('mimetype');
    expect(strFromU8(z['mimetype'])).toBe('application/epub+zip');
    // mimetype は無圧縮（ローカルヘッダの圧縮方式 = 0）
    expect(r.epub[8] | (r.epub[9] << 8)).toBe(0);
    const opf = strFromU8(z['OEBPS/content.opf']);
    expect(opf).toContain('<dc:language>ja</dc:language>');
    expect(opf).toContain('page-progression-direction="rtl"');
    expect(opf).toContain('<meta name="primary-writing-mode" content="vertical-rl"/>');
    expect(strFromU8(z['OEBPS/style.css'])).toContain('writing-mode: vertical-rl');
    // すべての XHTML が整形式の XML である
    for (const n of names.filter((n) => n.endsWith('.xhtml') || n.endsWith('.opf') || n.endsWith('.ncx'))) {
      const errors: string[] = [];
      new DOMParser({ onError: (lvl: string, msg: string) => lvl !== 'warning' && errors.push(msg) } as never).parseFromString(strFromU8(z[n]), 'application/xml');
      expect(errors, n).toEqual([]);
    }
  });
});

describe('TXT', () => {
  it('短編：書名はファイル名から、段落と空行を保持', () => {
    const r = results.get('01-short.txt')!;
    expect(r.title).toBe('01-short');
    expect(r.fileName).toBe('01-short.epub');
    expect(r.chapters).toBe(1);
    const lines = allText(r).split('\n');
    expect(lines[0]).toBe('　駅前の古い時計は、いつも三分だけ遅れていた。');
    expect(lines[2]).toBe('');
    expect(lines).toHaveLength(10);
    expect(r.warnings.some((w) => w.includes('章見出しが見つからなかった'))).toBe(true);
  });

  it('複数章：章ごとにファイルが分かれ、目次に並ぶ', () => {
    const r = results.get('02-multi-chapter.txt')!;
    expect(r.headings).toBe(8);
    expect(r.chapters).toBe(9); // 冒頭（書名）＋ 8 章
    const nav = strFromU8(unzipSync(r.epub)['OEBPS/nav.xhtml']);
    const order = ['星降る町の測量士', 'プロローグ', '第一章　灰色の港', '第五章　夜明け前', 'エピローグ', 'あとがき'];
    let pos = -1;
    for (const t of order) {
      const p = nav.indexOf(`>${t}</a>`);
      expect(p, t).toBeGreaterThan(pos);
      pos = p;
    }
    expect(allXhtml(r)).toContain('<h1>第一章　灰色の港</h1>');
  });

  it('会話文：括弧・三点リーダーをそのまま保持', () => {
    const r = results.get('03-dialogue.txt')!;
    expect(r.headings).toBe(2);
    const t = allText(r);
    expect(t).toContain('「……拝見します」');
    expect(t).toContain('『止まっているはずなのに』と、彼女は小さく付け足した。');
  });

  it('記号：ダッシュ・特殊文字・ルビ記法・縦中横', () => {
    const r = results.get('04-symbols.txt')!;
    const x = allXhtml(r);
    const t = allText(r);
    for (const s of ['……そうか。そうだったのか――', '〈山括弧〉《二重山括弧だけ》〔亀甲〕［角括弧］', '①②③ ㈱ ㌔ ⅰ Ⅱ', '🌸😀', '𠮷野家、髙橋、﨑', '〜波ダッシュ〜', '♪♡※★☆→'])
      expect(t).toContain(s);
    expect(x).toContain('&amp;記号&lt;タグ&gt;');
    expect(r.rubyCount).toBe(4);
    expect(x).toContain('<ruby>魔法陣<rt>まほうじん</rt></ruby>');
    expect(x).toContain('<ruby>蒼穹<rt>そうきゅう</rt></ruby>');
    expect(x).toContain('<ruby>月読<rt>つくよみ</rt></ruby>');
    expect(x).toContain('<ruby>あの人<rt>・・・</rt></ruby>');
    expect(t).toContain('これは《かっこ》だけ。｜縦棒だけ。');
    expect(x).toContain('<span class="tcy">12</span>時<span class="tcy">5</span>分');
    expect(x).toContain('1024号室');
    expect(x).toContain('Version 2.10');
    expect(x).toContain('『嘘でしょ<span class="tcy">!?</span>』');
  });

  it('見出しなし：無理に分割しない', () => {
    const r = results.get('06-no-heading.txt')!;
    expect(r.headings).toBe(0);
    expect(r.chapters).toBe(1);
    expect(r.tocEntries).toBe(1);
  });

  it('長文：約 100 万字を欠落なく変換し、大きな章はファイルを分ける', () => {
    const r = results.get('07-long.txt')!;
    expect(r.verify.sourceChars).toBeGreaterThan(1_000_000);
    expect(r.verify.outputChars).toBe(r.verify.sourceChars);
    expect(r.headings).toBe(50);
    expect(r.chapters).toBeGreaterThan(50);
    expect(r.warnings.some((w) => w.includes('ファイルを分けました'))).toBe(true);
    for (const d of r.contentDocs) expect(new TextEncoder().encode(d.xhtml).length).toBeLessThan(260 * 1024);
  });

  it('文字コード：Shift_JIS / EUC-JP / BOM付き / UTF-16 / CRLF', () => {
    for (const f of ['09-sjis.txt', '10-eucjp.txt']) {
      const r = results.get(f)!;
      expect(allText(r)).toContain('「ダメ文字の表、ソ、能、十、予、申」');
      expect(r.headings).toBe(1);
    }
    expect(results.get('09-sjis.txt')!.encoding).toBe('Shift_JIS');
    expect(results.get('10-eucjp.txt')!.encoding).toBe('EUC-JP');
    expect(allText(results.get('11-utf8-bom-crlf.txt')!)).toBe(allText(results.get('01-short.txt')!));
    expect(allText(results.get('12-utf16le.txt')!)).toBe(allText(results.get('01-short.txt')!));
  });

  it('Markdown 見出し：階層つき目次', () => {
    const r = results.get('13-markdown-heading.txt')!;
    expect(r.headings).toBe(4);
    expect(r.chapters).toBe(2);
    const nav = strFromU8(unzipSync(r.epub)['OEBPS/nav.xhtml']);
    expect(nav).toMatch(/第一部<\/a>\s*<ol>\s*<li><a href="text0001.xhtml#h1">出会い/);
    expect(allText(r)).not.toContain('#');
  });
});

describe('DOCX', () => {
  it('ルビ・傍点・太字・見出しスタイル・改ページ', () => {
    const r = results.get('05-ruby.docx')!;
    const x = allXhtml(r);
    expect(x).toContain('<ruby>黄昏<rt>たそがれ</rt></ruby>');
    expect(x).toContain('<ruby>影<rt>かげ</rt></ruby>');
    expect(x).toContain('<ruby>硝子細工<rt>がらすざいく</rt></ruby>');
    expect(x).toContain('<span class="em-dot">決して</span>');
    expect(x).toContain('<b>逃げて</b>');
    expect(x).toContain('<b>文字</b>');
    expect(x).toContain('<i>斜体</i>');
    expect(x).toContain('<span class="underline">下線</span>');
    expect(x).toContain('<h1>第一章　影踏み</h1>');
    expect(x).toMatch(/<h2 id="h\d+">出口<\/h2>/);
    expect(x).toContain('改行を含む<br/>段落。');
    expect(r.headings).toBe(4);
    // 改ページ後の段落は新しいファイルから始まる
    expect(r.contentDocs.some((d) => /<body[^>]*>\s*<p>　改ページの後の段落。<\/p>/.test(d.xhtml))).toBe(true);
    const t = allText(r).split('\n');
    expect(t[0]).toBe('硝子の森');
    expect(t).toContain('　それは決して踏んではいけない影だった。');
    expect(r.warnings.filter((w) => !w.includes('章見出し'))).toEqual([]);
  });

  it('見出しなし DOCX：章分けしない', () => {
    const r = results.get('06-no-heading.docx')!;
    expect(r.headings).toBe(0);
    expect(r.chapters).toBe(1);
    expect(allText(r).split('\n')).toHaveLength(20);
  });

  it('見出しスタイルなしでも「第N章」から章を判定（styles.xml なし）', () => {
    const r = results.get('08-chapters-plain.docx')!;
    expect(r.headings).toBe(12);
    expect(r.chapters).toBe(13);
    expect(allText(r)).toContain('　観測記録12-200。今日の満潮は8時、灯台の光は白だった。');
  });

  it('省略した要素は警告し、黙って欠落させない', () => {
    const r = results.get('14-warnings.docx')!;
    const w = r.warnings.join('\n');
    expect(w).toContain('表 1 個');
    expect(w).toContain('画像・図形 1 個');
    expect(w).toContain('テキストボックス等の中の文字（約 3 文字）');
    expect(w).toContain('脚注');
    expect(w).toContain('隠し文字');
    const t = allText(r);
    expect(t).toContain('セルA');
    expect(t).toContain('　変更履歴足したの後。');
    expect(t).toContain('　リンクここの後。');
    expect(t).toContain('　フィールド3の後。');
    expect(t).not.toContain('消した');
    expect(t).not.toContain('PAGE');
    expect(t).not.toContain('箱の中');
  });
});

describe('異常系：分かりやすいエラーで止まる', () => {
  const cases: [string, RegExp][] = [
    ['90-empty.txt', /空です/],
    ['91-blank-lines.txt', /本文が見つかりません/],
    ['92-broken.docx', /壊れて/],
    ['93-not-zip.docx', /形式になっていないか、壊れています/],
    ['94-image.png', /対応していません/],
    ['95-old.doc', /古い Word 形式/],
    ['96-binary.txt', /文字以外のデータ/],
    ['97-zip-without-document.docx', /本文データが見つかりません/],
  ];
  it.each(cases)('%s', (f, msg) => {
    expect(() => run(f)).toThrow(ConvertError);
    expect(() => run(f)).toThrow(msg);
  });
});
