// 本文の欠落・重複チェック。生成した XHTML を読み直して、元原稿のテキストと突き合わせる。
import type { DomParserCtor } from './docx';
import { W, kids, parseXml, readDocxXml } from './docx';
import { decodeText, normalizeLines } from './txt';
import { stripInvalidXml } from './inline';

const XHTML = 'http://www.w3.org/1999/xhtml';

/** ルビを「親文字《ルビ》」として書き出した、本文 XHTML の行テキスト */
export function extractLines(xhtml: string, Parser: DomParserCtor): string[] {
  const doc = parseXml(xhtml, Parser);
  const body = doc.getElementsByTagNameNS(XHTML, 'body')[0];
  const lines: string[] = [];
  const walk = (el: Element): string => {
    let s = '';
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) s += n.nodeValue ?? '';
      else if (n.nodeType === 1) {
        const e = n as Element;
        if (e.localName === 'br') s += '\n';
        else if (e.localName === 'ruby') {
          let base = '';
          let rt = '';
          for (const k of kids(e)) {
            if (k.localName === 'rt') rt += k.textContent ?? '';
            else if (k.localName !== 'rp') base += k.textContent ?? '';
          }
          for (let t = e.firstChild; t; t = t.nextSibling) if (t.nodeType === 3) base += t.nodeValue ?? '';
          s += `${base}《${rt}》`;
        } else s += walk(e);
      }
    }
    return s;
  };
  for (const blk of kids(body)) {
    if (!/^(p|h[1-6])$/.test(blk.localName ?? '')) continue;
    const isBlank = blk.localName === 'p' && kids(blk).length === 1 && kids(blk)[0].localName === 'br' && (blk.textContent ?? '') === '';
    lines.push(...(isBlank ? [''] : walk(blk).split('\n')));
  }
  return lines;
}

/** 比較用の正規化：ルビ指定の縦棒（｜）だけを除く（ルビ記法の明示／省略の違いを吸収） */
const canon = (s: string) => s.replace(/[｜|]/g, '');

export interface VerifyResult {
  ok: boolean;
  sourceChars: number;
  outputChars: number;
  /** 最初に食い違った位置の説明 */
  detail?: string;
}

function compare(src: string[], out: string[]): VerifyResult {
  const a = src.map(canon);
  const b = out.map(canon);
  const sourceChars = a.join('').length;
  const outputChars = b.join('').length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        ok: false,
        sourceChars,
        outputChars,
        detail: `${i + 1} 行目付近：原稿「${(a[i] ?? '（なし）').slice(0, 30)}」／EPUB「${(b[i] ?? '（なし）').slice(0, 30)}」`,
      };
    }
  }
  return { ok: true, sourceChars, outputChars };
}

/** TXT：元ファイルの全行（Markdown 見出し記号のみ除く）と EPUB 本文の全行が一致するか */
export function verifyTxt(bytes: Uint8Array, contentDocs: { xhtml: string }[], Parser: DomParserCtor): VerifyResult {
  const src = normalizeLines(stripInvalidXml(decodeText(bytes).text).text).map((l) => {
    const md = /^\s*[#＃]{1,3}[ 　]+(\S.*)$/.exec(l);
    return md && l.trim().length <= 40 ? md[1] : l;
  });
  const out = contentDocs.flatMap((d) => extractLines(d.xhtml, Parser));
  return compare(src, out);
}

/**
 * DOCX：Word 文書の段落テキストを、変換処理とは別の簡易な方法で取り出して比較する。
 * 省略を警告した要素（画像・テキストボックス・隠し文字・削除履歴）は比較から除く。
 */
export function verifyDocx(bytes: Uint8Array, contentDocs: { xhtml: string }[], Parser: DomParserCtor): VerifyResult {
  const doc = parseXml(readDocxXml(bytes).document, Parser);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const SKIP = new Set(['del', 'moveFrom', 'drawing', 'pict', 'object', 'AlternateContent', 'instrText', 'delText', 'rPr', 'pPr', 'oMath', 'oMathPara']);
  const paras: string[] = [];
  const text = (el: Element): string => {
    let s = '';
    for (const k of kids(el)) {
      if (SKIP.has(k.localName ?? '')) continue;
      if (k.localName === 'r' && k.namespaceURI === W) {
        const rPr = kids(k).find((x) => x.localName === 'rPr');
        const v = rPr && kids(rPr).find((x) => x.localName === 'vanish');
        if (v && !/^(0|false|off)$/.test(v.getAttributeNS(W, 'val') || v.getAttribute('w:val') || '')) continue;
      }
      if (k.localName === 't' && k.namespaceURI === W) s += k.textContent ?? '';
      else if (k.localName === 'tab') s += '\t';
      else if (k.localName === 'noBreakHyphen') s += '‑';
      else if (k.localName === 'ruby') {
        const rt = kids(k).find((x) => x.localName === 'rt');
        const base = kids(k).find((x) => x.localName === 'rubyBase');
        const bt = base ? text(base) : '';
        const rtt = rt ? text(rt) : '';
        s += rtt && bt ? `${bt}《${rtt}》` : bt;
      } else if (k.localName === 'p' && k.namespaceURI === W) paras.push(s + text(k)), (s = '');
      else s += text(k);
    }
    return s;
  };
  text(body);
  // 段落・改行の区切りを無視し、文字の並びとして比較する（段落構造は TXT テストで検証）
  const out = contentDocs.flatMap((d) => extractLines(d.xhtml, Parser));
  const strip = (s: string) => stripInvalidXml(canon(s)).text.replace(/[\s　]/g, '');
  return compare([strip(paras.join(''))], [strip(out.join(''))]);
}
