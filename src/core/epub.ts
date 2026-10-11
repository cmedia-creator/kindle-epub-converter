import { zipSync, strToU8 } from 'fflate';
import type { Block, Book } from './model';
import { inlineText } from './model';
import { esc, inlineToXhtml } from './inline';

// Kindle 向け：1 ファイルが大きすぎると処理が重くなるため、この大きさを超える章は段落の切れ目で分ける
const MAX_FILE_BYTES = 240 * 1024;

export const CSS = `@charset "UTF-8";
html {
  writing-mode: vertical-rl;
  -webkit-writing-mode: vertical-rl;
  -epub-writing-mode: vertical-rl;
}
body {
  margin: 0;
  padding: 0;
  line-height: 1.75;
  text-align: justify;
  line-break: strict;
  -webkit-line-break: strict;
  -epub-line-break: strict;
  word-break: normal;
}
p {
  margin: 0;
  padding: 0;
}
h1, h2, h3 {
  font-weight: bold;
  line-height: 1.5;
  margin: 0 0 0 2em;
  padding: 0;
}
h1 { font-size: 1.4em; }
h2 { font-size: 1.25em; }
h3 { font-size: 1.1em; }
ruby rt { font-size: 0.5em; }
.tcy {
  text-combine-upright: all;
  -webkit-text-combine: horizontal;
  -epub-text-combine: horizontal;
}
.em-dot {
  text-emphasis-style: filled sesame;
  -webkit-text-emphasis-style: filled sesame;
  -epub-text-emphasis-style: filled sesame;
}
.underline { text-decoration: underline; }
.strike { text-decoration: line-through; }
.pb { page-break-before: always; }
nav ol { list-style-type: none; margin: 0; padding: 0; }
nav ol ol { margin-right: 1em; }
nav li { margin: 0; padding: 0; }
`;

interface TocEntry {
  level: number;
  label: string;
  href: string;
}

interface Doc {
  file: string;
  title: string;
  body: string;
}

function xhtml(title: string, body: string, bodyType = 'bodymatter'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head>
<meta charset="UTF-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body epub:type="${bodyType}">
${body}
</body>
</html>
`;
}

function blockXhtml(b: Block, id?: string): string {
  const cls = b.pageBreakBefore ? ' class="pb"' : '';
  const idAttr = id ? ` id="${id}"` : '';
  if (b.kind === 'h') return `<h${b.level}${idAttr}${cls}>${inlineToXhtml(b.inl)}</h${b.level}>`;
  const inner = inlineToXhtml(b.inl);
  // 空行は高さを保つため <br/> を入れる
  return `<p${idAttr}${cls}>${inner === '' ? '<br/>' : inner}</p>`;
}

/** 本文を章ファイルに分け、目次項目を作る */
function layout(book: Book): { docs: Doc[]; toc: TocEntry[]; splitBySize: number } {
  const topLevel = Math.min(...book.blocks.filter((b) => b.kind === 'h').map((b) => b.level), 99);
  const docs: Doc[] = [];
  const toc: TocEntry[] = [];
  let cur: string[] = [];
  let curBytes = 0;
  let curTitle = book.title;
  let anchor = 0;
  let splitBySize = 0;
  const enc = new TextEncoder();

  const flush = () => {
    if (!cur.length) return;
    const file = `text${String(docs.length + 1).padStart(4, '0')}.xhtml`;
    docs.push({ file, title: curTitle, body: cur.join('\n') });
    cur = [];
    curBytes = 0;
  };
  const nextFile = () => `text${String(docs.length + 1).padStart(4, '0')}.xhtml`;

  for (let i = 0; i < book.blocks.length; i++) {
    const b = book.blocks[i];
    if (b.kind === 'h') {
      const label = inlineText(b.inl).replace(/\n/g, ' ').trim();
      if (b.level === topLevel) {
        flush();
        curTitle = label;
        toc.push({ level: 1, label, href: nextFile() });
        const html = blockXhtml({ ...b, pageBreakBefore: false });
        cur.push(html);
        curBytes += enc.encode(html).length;
        continue;
      }
      const id = `h${++anchor}`;
      // 前の章がない場合（下位見出しから始まる）も目次に入るよう、ここでファイル名を確定させる
      toc.push({ level: Math.min(b.level - topLevel + 1, 3), label, href: `${nextFile()}#${id}` });
      const html = blockXhtml(b, id);
      cur.push(html);
      curBytes += enc.encode(html).length;
      continue;
    }
    if (b.pageBreakBefore && cur.length) {
      // 改ページ指定は、ファイルを分けて確実に新しいページから始める
      flush();
      cur.push(blockXhtml({ ...b, pageBreakBefore: false }));
      continue;
    }
    const html = blockXhtml(b);
    const size = enc.encode(html).length;
    if (curBytes + size > MAX_FILE_BYTES && cur.length) {
      splitBySize++;
      flush();
    }
    cur.push(html);
    curBytes += size;
  }
  flush();
  if (!docs.length) docs.push({ file: 'text0001.xhtml', title: book.title, body: '<p><br/></p>' });
  // 見出しより前に本文がある場合、または見出しがない場合は、先頭を書名で目次に入れる
  if (!toc.length || toc[0].href.split('#')[0] !== docs[0].file || toc[0].href.includes('#')) {
    // 章見出しの前に短い行（原稿上の書名など）があればそれを、なければファイル名由来の書名を使う
    let label = book.title;
    if (toc.length) {
      const first = book.blocks.find((b) => inlineText(b.inl).trim() !== '');
      const s = first && first.kind === 'p' ? inlineText(first.inl).trim() : '';
      if (s && s.length <= 30 && !/[。、」』]$/.test(s) && !s.includes('\n')) label = s;
    }
    toc.unshift({ level: 1, label, href: docs[0].file });
  }
  return { docs, toc, splitBySize };
}

function navOl(toc: TocEntry[]): string {
  // レベルの入れ子を正しく閉じながら <ol> を組み立てる
  let html = '<ol>\n';
  let depth = 1;
  toc.forEach((e, i) => {
    const lvl = Math.min(e.level, depth + 1);
    if (i > 0) {
      if (lvl > depth) html += '\n<ol>\n';
      else {
        html += '</li>\n';
        for (; depth > lvl; depth--) html += '</ol>\n</li>\n';
      }
    }
    depth = lvl;
    html += `<li><a href="${esc(e.href)}">${esc(e.label)}</a>`;
  });
  html += '</li>\n';
  for (; depth > 1; depth--) html += '</ol>\n</li>\n';
  return html + '</ol>';
}

function ncx(uid: string, title: string, toc: TocEntry[]): string {
  const points = toc
    .map(
      (e, i) =>
        `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(e.label)}</text></navLabel><content src="${esc(e.href)}"/></navPoint>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ja">
<head>
<meta name="dtb:uid" content="${esc(uid)}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${esc(title)}</text></docTitle>
<navMap>
${points}
</navMap>
</ncx>
`;
}

export interface BuildResult {
  epub: Uint8Array;
  /** 本文 XHTML（検証用） */
  contentDocs: { file: string; xhtml: string }[];
  chapters: number;
  tocEntries: number;
  warnings: string[];
}

export function buildEpub(book: Book, opts: { uuid: string; modified: Date }): BuildResult {
  const { docs, toc, splitBySize } = layout(book);
  const warnings: string[] = [];
  if (splitBySize)
    warnings.push(
      `長い章を Kindle で快適に読めるよう、段落の切れ目で ${splitBySize} か所 ファイルを分けました（その位置で改ページされます）。`,
    );
  const showToc = toc.length >= 2;
  const uid = `urn:uuid:${opts.uuid}`;
  const modified = opts.modified.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const title = book.title;

  const contentDocs = docs.map((d) => ({ file: d.file, xhtml: xhtml(d.title, d.body) }));
  const nav = xhtml(
    '目次',
    `<nav epub:type="toc" id="toc">
<h1>目次</h1>
${navOl(toc)}
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol>
${showToc ? '<li><a epub:type="toc" href="nav.xhtml">目次</a></li>\n' : ''}<li><a epub:type="bodymatter" href="${docs[0].file}">本文</a></li>
</ol>
</nav>`,
    'frontmatter',
  );

  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...docs.map((d, i) => `<item id="t${i + 1}" href="${d.file}" media-type="application/xhtml+xml"/>`),
  ].join('\n');
  const spine = [
    ...(showToc ? ['<itemref idref="nav"/>'] : []),
    ...docs.map((_, i) => `<itemref idref="t${i + 1}"/>`),
  ].join('\n');

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="ja">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="BookId">${uid}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
<dc:language>ja</dc:language>
<meta property="dcterms:modified">${modified}</meta>
<meta property="rendition:layout">reflowable</meta>
<meta property="rendition:spread">auto</meta>
<meta name="primary-writing-mode" content="vertical-rl"/>
</metadata>
<manifest>
${manifest}
</manifest>
<spine toc="ncx" page-progression-direction="rtl">
${spine}
</spine>
</package>
`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

  // mimetype は無圧縮で先頭に置く（EPUB OCF の必須要件）
  const files: Record<string, [Uint8Array, { level: 0 | 9; mtime: Date }]> = {};
  const mtime = opts.modified;
  files['mimetype'] = [strToU8('application/epub+zip'), { level: 0, mtime }];
  files['META-INF/container.xml'] = [strToU8(container), { level: 9, mtime }];
  files['OEBPS/content.opf'] = [strToU8(opf), { level: 9, mtime }];
  files['OEBPS/nav.xhtml'] = [strToU8(nav), { level: 9, mtime }];
  files['OEBPS/toc.ncx'] = [strToU8(ncx(uid, title, toc)), { level: 9, mtime }];
  files['OEBPS/style.css'] = [strToU8(CSS), { level: 9, mtime }];
  for (const d of contentDocs) files[`OEBPS/${d.file}`] = [strToU8(d.xhtml), { level: 9, mtime }];

  return {
    epub: zipSync(files),
    contentDocs,
    chapters: docs.length,
    tocEntries: toc.length,
    warnings,
  };
}
