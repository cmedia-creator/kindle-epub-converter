import { unzipSync, strFromU8 } from 'fflate';
import type { Block, Book, Inline, Marks } from './model';
import { inlineText } from './model';
import { applyRubyNotation, stripInvalidXml } from './inline';
import { detectHeading } from './headings';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

export type DomParserCtor = new () => { parseFromString(s: string, type: string): Document };

export class ConvertError extends Error {}

export function kids(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

function child(el: Element | null | undefined, name: string, ns = W): Element | null {
  if (!el) return null;
  for (const k of kids(el)) if (k.localName === name && k.namespaceURI === ns) return k;
  return null;
}

function attr(el: Element | null, name: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W, name) || el.getAttribute('w:' + name) || null;
}

/** <w:b/> や <w:b w:val="0"/> のような ON/OFF 属性 */
function toggle(el: Element | null): boolean | undefined {
  if (!el) return undefined;
  const v = attr(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}

export function parseXml(xml: string, Parser: DomParserCtor): Document {
  const doc = new Parser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ConvertError('DOCX 内部の XML を読み込めませんでした。');
  return doc;
}

interface StyleInfo {
  name: string;
  basedOn?: string;
  outlineLvl?: number;
  marks: Marks;
  vanish?: boolean;
}

function readMarks(rPr: Element | null): Marks & { vanish?: boolean } {
  const m: Marks & { vanish?: boolean } = {};
  if (!rPr) return m;
  const b = toggle(child(rPr, 'b'));
  if (b !== undefined) m.b = b;
  const i = toggle(child(rPr, 'i'));
  if (i !== undefined) m.i = i;
  const em = child(rPr, 'em');
  if (em) m.em = attr(em, 'val') !== 'none';
  const u = child(rPr, 'u');
  if (u) m.u = attr(u, 'val') !== 'none';
  const s = toggle(child(rPr, 'strike')) ?? toggle(child(rPr, 'dstrike'));
  if (s !== undefined) m.s = s;
  const v = toggle(child(rPr, 'vanish'));
  if (v !== undefined) m.vanish = v;
  return m;
}

function readStyles(xml: string | null, Parser: DomParserCtor): Map<string, StyleInfo> {
  const map = new Map<string, StyleInfo>();
  if (!xml) return map;
  const doc = parseXml(xml, Parser);
  const styles = doc.getElementsByTagNameNS(W, 'style');
  for (let i = 0; i < styles.length; i++) {
    const st = styles[i];
    const id = attr(st, 'styleId');
    if (!id) continue;
    const lvl = attr(child(child(st, 'pPr'), 'outlineLvl'), 'val');
    const rm = readMarks(child(st, 'rPr'));
    map.set(id, {
      name: attr(child(st, 'name'), 'val') ?? id,
      basedOn: attr(child(st, 'basedOn'), 'val') ?? undefined,
      outlineLvl: lvl !== null ? parseInt(lvl, 10) : undefined,
      marks: rm,
      vanish: rm.vanish,
    });
  }
  return map;
}

function styleChain(styles: Map<string, StyleInfo>, id: string | null): StyleInfo[] {
  const chain: StyleInfo[] = [];
  const seen = new Set<string>();
  while (id && styles.has(id) && !seen.has(id)) {
    seen.add(id);
    const s = styles.get(id)!;
    chain.push(s);
    id = s.basedOn ?? null;
  }
  return chain;
}

/** 段落スタイルから見出しレベル（1〜3）を求める。見出しでなければ 0 */
function headingLevel(styles: Map<string, StyleInfo>, pPr: Element | null): number {
  const direct = attr(child(pPr, 'outlineLvl'), 'val');
  if (direct !== null) {
    const n = parseInt(direct, 10);
    return n >= 0 && n <= 8 ? Math.min(n + 1, 3) : 0;
  }
  for (const s of styleChain(styles, attr(child(pPr, 'pStyle'), 'val'))) {
    const nm = s.name.trim().toLowerCase().replace(/[１-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    const m = /^(?:heading|見出し)\s*([1-9])$/.exec(nm);
    if (m) return Math.min(parseInt(m[1], 10), 3);
    if (s.outlineLvl !== undefined) return s.outlineLvl >= 0 && s.outlineLvl <= 8 ? Math.min(s.outlineLvl + 1, 3) : 0;
  }
  return 0;
}

interface Ctx {
  styles: Map<string, StyleInfo>;
  warn: Map<string, number>;
  pendingPageBreak: boolean;
}

function note(ctx: Ctx, key: string, n = 1) {
  ctx.warn.set(key, (ctx.warn.get(key) ?? 0) + n);
}

/** 要素内のテキストボックス等のテキスト量（省略した文字数の警告用） */
function textLength(el: Element): number {
  const ts = el.getElementsByTagNameNS(W, 't');
  let n = 0;
  for (let i = 0; i < ts.length; i++) n += (ts[i].textContent ?? '').length;
  return n;
}

function runMarks(ctx: Ctx, rPr: Element | null): Marks & { vanish?: boolean } {
  const out: Marks & { vanish?: boolean } = {};
  const chain = styleChain(ctx.styles, attr(child(rPr, 'rStyle'), 'val')).reverse();
  for (const s of chain) Object.assign(out, s.marks);
  Object.assign(out, readMarks(rPr));
  return out;
}

function cleanMarks(m: Marks & { vanish?: boolean }): Marks | undefined {
  const r: Marks = {};
  if (m.b) r.b = true;
  if (m.i) r.i = true;
  if (m.em) r.em = true;
  if (m.u) r.u = true;
  if (m.s) r.s = true;
  return Object.keys(r).length ? r : undefined;
}

/** 埋め込みオブジェクト（画像・図形・テキストボックス）を警告して省略する */
function skipObject(ctx: Ctx, el: Element) {
  // mc:AlternateContent は Choice と Fallback に同じ内容が重複するため Choice だけを見る
  let target = el;
  if (el.localName === 'AlternateContent') {
    target = kids(el).find((k) => k.localName === 'Choice') ?? el;
  }
  const txt = textLength(target);
  if (txt > 0) note(ctx, 'textbox', txt);
  else note(ctx, 'image');
}

function readRun(ctx: Ctx, r: Element, out: Inline[]) {
  const m = runMarks(ctx, child(r, 'rPr'));
  if (m.vanish) {
    const n = textLength(r);
    if (n) note(ctx, 'hidden', n);
    return;
  }
  const marks = cleanMarks(m);
  for (const k of kids(r)) {
    if (k.namespaceURI === MC) {
      skipObject(ctx, k);
      continue;
    }
    if (k.namespaceURI !== W) continue;
    switch (k.localName) {
      case 't':
        out.push({ t: 'text', text: k.textContent ?? '', m: marks });
        break;
      case 'tab':
        out.push({ t: 'text', text: '\t', m: marks });
        break;
      case 'noBreakHyphen':
        out.push({ t: 'text', text: '‑', m: marks });
        break;
      case 'sym': {
        const code = parseInt(attr(k, 'char') ?? '', 16);
        if (code >= 0xf000 && code <= 0xf0ff) note(ctx, 'sym');
        else if (code > 0) out.push({ t: 'text', text: String.fromCodePoint(code), m: marks });
        break;
      }
      case 'br':
      case 'cr':
        if (attr(k, 'type') === 'page') ctx.pendingPageBreak = true;
        else if (attr(k, 'type') !== 'column') out.push({ t: 'br' });
        break;
      case 'ruby': {
        const base: Inline[] = [];
        const rt: Inline[] = [];
        for (const rr of kids(child(k, 'rubyBase') ?? k)) if (rr.localName === 'r') readRun(ctx, rr, base);
        for (const rr of kids(child(k, 'rt') ?? k)) if (rr.localName === 'r') readRun(ctx, rr, rt);
        const bt = inlineText(base);
        const rtt = inlineText(rt);
        if (bt && rtt) out.push({ t: 'ruby', base: bt, rt: rtt, m: marks });
        else if (bt) out.push({ t: 'text', text: bt, m: marks });
        break;
      }
      case 'drawing':
      case 'pict':
      case 'object':
        skipObject(ctx, k);
        break;
      case 'footnoteReference':
      case 'endnoteReference':
        note(ctx, 'footnote');
        break;
      // rPr, fldChar, instrText（フィールドコード）, lastRenderedPageBreak, delText などは表示されないので無視
    }
  }
}

function readInlineContainer(ctx: Ctx, el: Element, out: Inline[]) {
  for (const k of kids(el)) {
    if (k.namespaceURI === MC) {
      skipObject(ctx, k);
      continue;
    }
    if (k.namespaceURI !== W) {
      if (k.localName === 'oMath' || k.localName === 'oMathPara') note(ctx, 'math');
      continue;
    }
    switch (k.localName) {
      case 'r':
        readRun(ctx, k, out);
        break;
      case 'hyperlink':
      case 'ins':
      case 'moveTo':
      case 'smartTag':
      case 'customXml':
      case 'fldSimple':
      case 'dir':
      case 'bdo':
        readInlineContainer(ctx, k, out);
        break;
      case 'sdt':
        readInlineContainer(ctx, child(k, 'sdtContent') ?? k, out);
        break;
      // del / moveFrom（変更履歴で削除された文字）は表示されないので含めない
    }
  }
}

function readBlocks(ctx: Ctx, container: Element, blocks: Block[]) {
  for (const k of kids(container)) {
    if (k.namespaceURI !== W) continue;
    switch (k.localName) {
      case 'p': {
        const pPr = child(k, 'pPr');
        const inl: Inline[] = [];
        const pb = ctx.pendingPageBreak || toggle(child(pPr, 'pageBreakBefore')) === true;
        ctx.pendingPageBreak = false;
        readInlineContainer(ctx, k, inl);
        const level = headingLevel(ctx.styles, pPr);
        const hasText = inlineText(inl).trim() !== '';
        const block: Block =
          level > 0 && hasText ? { kind: 'h', level, inl } : { kind: 'p', inl };
        if (pb) block.pageBreakBefore = true;
        blocks.push(block);
        // セクション区切り（次のページから）は改ページとして扱う
        const sect = child(pPr, 'sectPr');
        if (sect && attr(child(sect, 'type'), 'val') !== 'continuous') ctx.pendingPageBreak = true;
        break;
      }
      case 'tbl':
        note(ctx, 'table');
        for (const tr of kids(k)) if (tr.localName === 'tr') for (const tc of kids(tr)) if (tc.localName === 'tc') readBlocks(ctx, tc, blocks);
        break;
      case 'sdt':
        readBlocks(ctx, child(k, 'sdtContent') ?? k, blocks);
        break;
      case 'customXml':
      case 'ins':
        readBlocks(ctx, k, blocks);
        break;
    }
  }
}

const WARN_TEXT: Record<string, (n: number) => string> = {
  image: (n) => `画像・図形 ${n} 個は変換対象外のため省略しました。`,
  textbox: (n) => `テキストボックス等の中の文字（約 ${n} 文字）は変換対象外のため省略しました。本文に移すと変換されます。`,
  table: (n) => `表 ${n} 個は、表の形ではなく通常の段落として出力しました。`,
  footnote: (n) => `脚注・文末脚注 ${n} 個は変換対象外のため、注の内容は含まれていません。`,
  hidden: (n) => `Word の「隠し文字」設定の文字（約 ${n} 文字）は表示されない文字のため含めていません。`,
  sym: (n) => `記号フォント（Symbol 等）の特殊記号 ${n} 個は変換できないため省略しました。`,
  math: (n) => `数式 ${n} 個は変換対象外のため省略しました。`,
};

export function readDocxXml(bytes: Uint8Array): { document: string; styles: string | null } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' || f.name === 'word/styles.xml' });
  } catch {
    throw new ConvertError('DOCX ファイルが壊れているため読み込めませんでした。Word で開いて保存し直してください。');
  }
  const doc = files['word/document.xml'];
  if (!doc) throw new ConvertError('Word 文書（.docx）として読み込めませんでした。本文データが見つかりません。');
  return { document: strFromU8(doc), styles: files['word/styles.xml'] ? strFromU8(files['word/styles.xml']) : null };
}

export function parseDocx(bytes: Uint8Array, title: string, Parser: DomParserCtor): Book {
  const xml = readDocxXml(bytes);
  const ctx: Ctx = { styles: readStyles(xml.styles, Parser), warn: new Map(), pendingPageBreak: false };
  const doc = parseXml(xml.document, Parser);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new ConvertError('Word 文書の本文が見つかりませんでした。');

  const raw: Block[] = [];
  readBlocks(ctx, body, raw);

  // 前後の空段落を除く（TXT と同じ扱い）
  const isEmpty = (b: Block) => b.kind === 'p' && inlineText(b.inl).trim() === '' && !b.inl.some((n) => n.t === 'ruby');
  while (raw.length && isEmpty(raw[0])) raw.shift();
  while (raw.length && isEmpty(raw[raw.length - 1])) raw.pop();

  const usesStyles = raw.some((b) => b.kind === 'h');
  let rubyCount = 0;
  let removedTotal = 0;
  const blocks: Block[] = raw.map((b) => {
    const inl: Inline[] = b.inl.map((n) => {
      if (n.t === 'br') return n;
      if (n.t === 'text') {
        const { text, removed } = stripInvalidXml(n.text);
        removedTotal += removed;
        return { ...n, text };
      }
      const base = stripInvalidXml(n.base);
      const rt = stripInvalidXml(n.rt);
      removedTotal += base.removed + rt.removed;
      return { ...n, base: base.text, rt: rt.text };
    });
    const r = applyRubyNotation(inl);
    rubyCount += r.count;
    // 見出しスタイルが一つも使われていない場合のみ、文字パターンで章見出しを判定する
    if (!usesStyles && b.kind === 'p' && !r.inl.some((n) => n.t === 'br')) {
      const h = detectHeading(inlineText(r.inl));
      if (h && !h.markdown) return { kind: 'h', level: 1, inl: r.inl, pageBreakBefore: b.pageBreakBefore };
    }
    return { ...b, inl: r.inl };
  });

  const warnings: string[] = [];
  for (const [k, n] of ctx.warn) warnings.push(WARN_TEXT[k](n));
  if (removedTotal) warnings.push(`EPUB に使えない制御文字を ${removedTotal} 個 取り除きました。`);
  return { title, blocks, warnings, rubyCount };
}
