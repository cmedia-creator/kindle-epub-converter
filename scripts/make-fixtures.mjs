// テスト用原稿を生成する。文章はすべてこのスクリプトのために書いた架空のもの。
// 使い方: node scripts/make-fixtures.mjs   （Shift_JIS / EUC-JP の生成に iconv を使用）
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const DIR = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const out = (name, data) => writeFileSync(new URL(name, DIR), data);

// ---------- TXT ----------
const short = `　駅前の古い時計は、いつも三分だけ遅れていた。
　灯子はその三分のあいだに、毎朝ひとつだけ願いごとをする。

　今日の願いは、雨が降らないこと。
　けれど空は、彼女の頼みを聞く気がないらしかった。

「傘、持ってないの？」
　振り向くと、知らない少年が青い傘を差し出していた。
「返さなくていいよ。どうせ三分後には、ぼくはいないから」
　時計の針が、かちりと動いた。
`;
out('01-short.txt', short);

const chapters = ['プロローグ', '第一章　灰色の港', '第二章　北へ向かう列車', '第三章　鍵のない扉', '第四章　風見鶏の丘', '第五章　夜明け前', 'エピローグ', 'あとがき'];
let longNovel = '星降る町の測量士\n\n';
chapters.forEach((h, ci) => {
  longNovel += `${h}\n\n`;
  for (let i = 0; i < 40; i++) {
    longNovel += `　測量士のミナトは、${ci + 1}番目の地図の${i + 1}行目に、見たことのない記号を書き込んだ。\n`;
    if (i % 7 === 6) longNovel += '\n';
    if (i % 5 === 0) longNovel += `「この道は、本当に北へ続いているのか？」と、助手のサエが訊いた。\n`;
  }
  longNovel += '\n';
});
out('02-multi-chapter.txt', longNovel);

let dialogue = '第1話　質屋の娘\n\n';
const lines = [
  '「いらっしゃいませ。何をお預けになりますか」',
  '「これを。祖母の形見なんです」',
  '「……拝見します」',
  '「値段がつかなくても構いません。ただ、しばらく預かってほしくて」',
  '「預かるだけ、ですか？」',
  '「ええ。家に置いておくと、毎晩、懐中時計が鳴るんです」',
  '『止まっているはずなのに』と、彼女は小さく付け足した。',
  '「わかりました。では、お預かり証を」',
];
for (let i = 0; i < 30; i++) dialogue += lines[i % lines.length] + '\n';
dialogue += '\n第2話　鳴らない鐘\n\n';
for (let i = 0; i < 30; i++) dialogue += lines[(i + 3) % lines.length] + '\n';
out('03-dialogue.txt', dialogue);

const symbols = `記号の多い章

「……そうか。そうだったのか――」
　彼は息を呑んだ。――いや、呑んだふりをした。
『嘘でしょ!?』『本当だよ!!』
（括弧の中の独白）【見出し風】〈山括弧〉《二重山括弧だけ》〔亀甲〕［角括弧］
　時刻は12時5分。気温は３８度。部屋番号は1024号室。Version 2.10 の記録。
　ルビの例：｜魔法陣《まほうじん》、蒼穹《そうきゅう》、|月読《つくよみ》、｜あの人《・・・》。
　ルビにならない例：これは《かっこ》だけ。｜縦棒だけ。
　〜波ダッシュ〜、全角スペース　あり、半角スペース あり、♪♡※★☆→
　機種依存文字：①②③ ㈱ ㌔ ⅰ Ⅱ、絵文字：🌸😀、異体字：𠮷野家、髙橋、﨑。
　&記号<タグ>"引用"'単引用'
`;
out('04-symbols.txt', symbols);

let noHeading = '';
for (let i = 0; i < 60; i++) noHeading += `　その日、${i + 1}匹目の猫が窓辺にやってきた。誰も名前を知らない猫だった。\n${i % 9 === 8 ? '\n' : ''}`;
out('06-no-heading.txt', noHeading);

// 長文：約 100 万字。章が 50 あり、うち 1 章は見出しなしの巨大な章
const sentences = [
  '　坂の上の図書館には、閉館後にだけ開く書架があるという噂だった。',
  '「噂なんて、だいたい誰かの願望よ」と司書の真白は言った。',
  '　それでも少年は、毎晩九時になると坂を上った。',
  '　風が強い夜は、ページのめくれる音が町じゅうに響いた――気がした。',
  '「今夜も来たの？……仕方ないわね」',
];
let longText = '';
for (let c = 1; c <= 50; c++) {
  longText += `第${c}章　${c}冊目の本\n\n`;
  const n = c === 25 ? 6000 : 700;
  for (let i = 0; i < n; i++) {
    longText += sentences[(i + c) % sentences.length] + (i % 50 === 49 ? `（${c}-${i}）` : '') + '\n';
    if (i % 40 === 39) longText += '\n';
  }
  longText += '\n';
}
out('07-long.txt', longText);

// 文字コード違い・改行コード違い
const sjisSrc = '第一章　文字コードの試験\n\n　これは Shift_JIS で保存された原稿です。機種依存文字は含みません。\n「ダメ文字の表、ソ、能、十、予、申」\n';
const conv = (enc, s) => spawnSync('iconv', ['-f', 'UTF-8', '-t', enc], { input: s }).stdout;
out('09-sjis.txt', conv('CP932', sjisSrc.replace(/\n/g, '\r\n')));
out('10-eucjp.txt', conv('EUC-JP', sjisSrc));
out('11-utf8-bom-crlf.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(short.replace(/\n/g, '\r\n'))]));
out('12-utf16le.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(short, 'utf16le')]));
out('13-markdown-heading.txt', '# 第一部\n\n## 出会い\n\n　本文その一。\n\n## 別れ\n\n　本文その二。\n\n# 第二部\n\n　本文その三。\n');

// 異常系
out('90-empty.txt', '');
out('91-blank-lines.txt', '\n\n　\n\n');
out('92-broken.docx', Buffer.from('PK\u0003\u0004this is not really a zip file'));
out('93-not-zip.docx', Buffer.from('ただのテキストを .docx にしたもの'));
out('94-image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
out('95-old.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]));
out('96-binary.txt', Buffer.from(Array.from({ length: 2000 }, (_, i) => (i % 3 ? 0 : 65))));
out('97-zip-without-document.docx', zipSync({ 'hello.txt': strToU8('hi') }));

// ---------- DOCX ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const ruby = (base, rt) =>
  `<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="distributeSpace"/><w:hps w:val="10"/><w:hpsRaise w:val="18"/><w:hpsBaseText w:val="21"/><w:lid w:val="ja-JP"/></w:rubyPr><w:rt><w:r><w:rPr><w:sz w:val="10"/></w:rPr><w:t>${esc(rt)}</w:t></w:r></w:rt><w:rubyBase><w:r><w:t>${esc(base)}</w:t></w:r></w:rubyBase></w:ruby></w:r>`;
const p = (inner, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
const para = (t, style) => p(t ? run(t) : '', style);

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/><w:basedOn w:val="a"/><w:next w:val="a"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/><w:basedOn w:val="a"/><w:next w:val="a"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="a3"><w:name w:val="Title"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="character" w:styleId="a4"><w:name w:val="Strong"/><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
</w:styles>`;

function docx(bodyXml, { styles = STYLES } = {}) {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"><w:body>${bodyXml}<w:sectPr><w:textDirection w:val="tbRl"/><w:pgSz w:w="11906" w:h="16838" w:orient="landscape"/></w:sectPr></w:body></w:document>`;
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'word/document.xml': strToU8(document),
  };
  if (styles) files['word/styles.xml'] = strToU8(styles);
  return zipSync(files);
}

// 05: ルビ・傍点・太字・見出しスタイルを含む DOCX
const rubyBody = [
  para('硝子の森', 'a3'),
  para('第一章　影踏み', '1'),
  p(run('　') + ruby('黄昏', 'たそがれ') + run('の森で、少女は') + ruby('影', 'かげ') + run('を踏んだ。')),
  p(run('　それは') + run('決して', '<w:em w:val="dot"/>') + run('踏んではいけない影だった。')),
  p(run('「') + run('逃げて', '<w:b/>') + run('」と誰かが叫んだ。')),
  para(''),
  p(run('　強調スタイルの') + run('文字', '<w:rStyle w:val="a4"/>') + run('と、') + run('斜体', '<w:i/>') + run('と、') + run('下線', '<w:u w:val="single"/>') + run('。')),
  para('第二章　森の外', '1'),
  para('出口', '2'),
  p(run('　原稿にルビ記法で書いた｜硝子細工《がらすざいく》も変換される。')),
  p(run('　改行を含む') + '<w:r><w:br/></w:r>' + run('段落。')),
  p('<w:r><w:br w:type="page"/></w:r>'),
  para('　改ページの後の段落。'),
  para('出口の先', '2'),
  para('　終わり。'),
].join('');
out('05-ruby.docx', docx(rubyBody));

// 06: 見出しスタイルのない DOCX（章見出しは文字パターンで判定される）
let nh = '';
for (let i = 0; i < 20; i++) nh += para(`　${i + 1}行目の段落です。見出しはありません。`);
out('06-no-heading.docx', docx(nh));

// 08: 見出しスタイルなし・文字だけの章題を持つ長めの DOCX（複数章）
let ch = para('海辺の観測所') + para('');
for (let c = 1; c <= 12; c++) {
  ch += para(`第${c}章　潮見表${c}`);
  for (let i = 0; i < 200; i++) ch += para(`　観測記録${c}-${i + 1}。今日の満潮は${(i % 12) + 1}時、灯台の光は${i % 3 ? '白' : '赤'}だった。`);
  ch += para('');
}
out('08-chapters-plain.docx', docx(ch, { styles: null }));

// 14: 省略・警告が必要な要素（画像、テキストボックス、表、脚注、隠し文字、変更履歴）
const warnBody = [
  para('第一章　警告の試験', '1'),
  para('　表の前。'),
  `<w:tbl><w:tr><w:tc><w:p>${run('セルA')}</w:p></w:tc><w:tc><w:p>${run('セルB')}</w:p></w:tc></w:tr></w:tbl>`,
  p(run('　画像') + '<w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/></wp:inline></w:drawing></w:r>' + run('の後。')),
  p(
    run('　テキストボックス') +
      `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:txbx><w:txbxContent><w:p>${run('箱の中')}</w:p></w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent><w:p>${run('箱の中')}</w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r>` +
      run('の後。'),
  ),
  p(run('　脚注つき') + '<w:r><w:footnoteReference w:id="1"/></w:r>' + run('の文。')),
  p(run('　隠し文字') + run('見えない', '<w:vanish/>') + run('の後。')),
  p(run('　変更履歴') + `<w:del w:id="1" w:author="x"><w:r><w:delText>消した</w:delText></w:r></w:del>` + `<w:ins w:id="2" w:author="x">${run('足した')}</w:ins>` + run('の後。')),
  p(run('　リンク') + `<w:hyperlink r:id="rId9">${run('ここ')}</w:hyperlink>` + run('の後。')),
  p(run('　フィールド') + '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run('3') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>' + run('の後。')),
].join('');
out('14-warnings.docx', docx(warnBody));

console.log('fixtures written');
