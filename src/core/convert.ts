import type { DomParserCtor } from './docx';
import { ConvertError, parseDocx } from './docx';
import { parseTxt } from './txt';
import { buildEpub } from './epub';
import { verifyDocx, verifyTxt, type VerifyResult } from './verify';
import { inlineText } from './model';

export { ConvertError };

export interface ConvertResult {
  epub: Uint8Array;
  fileName: string;
  title: string;
  format: 'txt' | 'docx';
  encoding?: string;
  chapters: number;
  tocEntries: number;
  headings: number;
  rubyCount: number;
  warnings: string[];
  verify: VerifyResult;
  contentDocs: { file: string; xhtml: string }[];
}

const MAX_BYTES = 100 * 1024 * 1024;

/** ファイル名から書名を作る（拡張子を除く） */
export function titleFromFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
  return base || '無題';
}

/** 保存用のファイル名（OS で使えない文字を置き換える） */
export function epubFileName(title: string): string {
  // eslint-disable-next-line no-control-regex
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').replace(/^\.+/, '').slice(0, 120).trim();
  return `${safe || 'book'}.epub`;
}

export function detectFormat(name: string, bytes: Uint8Array): 'txt' | 'docx' {
  const ext = (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (ext === 'doc' || isOle)
    throw new ConvertError('古い Word 形式（.doc）には対応していません。Word で「名前を付けて保存」から「Word 文書 (*.docx)」を選んで保存し直してください。');
  if (ext === 'docx' || ext === 'docm' || ext === 'dotx') {
    if (!isZip) throw new ConvertError('このファイルは .docx の形式になっていないか、壊れています。Word で開いて保存し直してください。');
    return 'docx';
  }
  if (ext === 'txt' || ext === 'text' || ext === 'md' || ext === '') {
    if (isZip) throw new ConvertError('テキストファイルとして読み込めませんでした（圧縮ファイルの可能性があります）。');
    return 'txt';
  }
  if (ext === 'pdf') throw new ConvertError('PDF には対応していません。Word 文書（.docx）またはテキスト（.txt）を選んでください。');
  if (ext === 'rtf' || ext === 'odt' || ext === 'pages')
    throw new ConvertError(`.${ext} 形式には対応していません。Word 文書（.docx）またはテキスト（.txt）で保存し直してください。`);
  throw new ConvertError(`.${ext} 形式には対応していません。Word 文書（.docx）またはテキスト（.txt）を選んでください。`);
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  let zeros = 0;
  for (let i = 0; i < n; i++) if (bytes[i] === 0) zeros++;
  // UTF-16 は BOM で判定済み。それ以外で NUL が多いものはバイナリとみなす
  const bom16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  return !bom16 && zeros > n * 0.01;
}

export function convert(
  name: string,
  bytes: Uint8Array,
  Parser: DomParserCtor,
  opts: { uuid?: string; modified?: Date } = {},
): ConvertResult {
  if (bytes.length === 0) throw new ConvertError('ファイルが空です（0 バイト）。原稿が保存されているか確認してください。');
  if (bytes.length > MAX_BYTES) throw new ConvertError('ファイルが大きすぎます（100MB まで）。');
  const format = detectFormat(name, bytes);
  if (format === 'txt' && looksBinary(bytes))
    throw new ConvertError('テキストファイルとして読み込めませんでした。文字以外のデータが含まれています。');

  const title = titleFromFileName(name);
  const book = format === 'txt' ? parseTxt(bytes, title) : parseDocx(bytes, title, Parser);
  if (!book.blocks.some((b) => inlineText(b.inl).trim() !== ''))
    throw new ConvertError('原稿に本文が見つかりませんでした（空の文書です）。');

  const built = buildEpub(book, {
    uuid: opts.uuid ?? crypto.randomUUID(),
    modified: opts.modified ?? new Date(),
  });
  const verify =
    format === 'txt' ? verifyTxt(bytes, built.contentDocs, Parser) : verifyDocx(bytes, built.contentDocs, Parser);

  const warnings = [...book.warnings, ...built.warnings];
  if (!book.blocks.some((b) => b.kind === 'h'))
    warnings.push('章見出しが見つからなかったため、章分けはしていません（目次は書名のみ）。');
  if (!verify.ok) warnings.unshift(`本文の照合で不一致が見つかりました。${verify.detail ?? ''}`);

  return {
    epub: built.epub,
    fileName: epubFileName(title),
    title,
    format,
    encoding: book.encoding,
    chapters: built.chapters,
    tocEntries: built.tocEntries,
    headings: book.blocks.filter((b) => b.kind === 'h').length,
    rubyCount: book.rubyCount,
    warnings,
    verify,
    contentDocs: built.contentDocs,
  };
}
