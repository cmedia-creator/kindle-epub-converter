import './style.css';
import { convert, ConvertError, type ConvertResult } from './core/convert';
import { decideOutcome } from './outcome';

const input = document.getElementById('file') as HTMLInputElement;
const drop = document.getElementById('drop') as HTMLLabelElement;
const status = document.getElementById('status') as HTMLElement;

let objectUrl: string | null = null;
let busy = false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function show(...nodes: Node[]) {
  status.replaceChildren(...nodes);
  status.hidden = false;
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderSuccess(r: ConvertResult) {
  const box = h('div', 'result ok');
  const title = h('p', 'result-title');
  title.append(h('span', 'mark', '✓'), document.createTextNode('EPUBファイルを作成しました'));
  const file = h('p', 'result-file', r.fileName);

  const facts = h('ul', 'facts');
  const chars = r.verify.outputChars.toLocaleString('ja-JP');
  facts.append(
    h('li', '', `本文 ${chars} 文字`),
    h('li', '', r.headings ? `章見出し ${r.headings} 件（目次に掲載）` : '章見出しなし'),
  );
  if (r.rubyCount) facts.append(h('li', '', `ルビ記法 ${r.rubyCount} 件をルビに変換`));
  if (r.encoding) facts.append(h('li', '', `文字コード ${r.encoding}`));
  facts.append(h('li', 'good', '原稿との本文照合：一致'));

  const again = h('p', 'manual');
  const btn = h('button', 'btn', 'ダウンロード');
  btn.type = 'button';
  btn.addEventListener('click', () => objectUrl && download(objectUrl, r.fileName));
  again.append(h('span', '', 'ダウンロードが始まらない場合は'), btn);

  box.append(
    title,
    file,
    facts,
    again,
    h('p', 'hint', '続けて複数の原稿を変換すると、ブラウザが「複数ファイルのダウンロード」をブロックすることがあります。その場合は、アドレスバーに出る表示からダウンロードを許可してください。'),
  );

  const notes = r.warnings.filter((w) => !w.startsWith('章見出しが見つからなかった'));
  if (notes.length) {
    const wbox = h('div', 'warn');
    wbox.append(h('p', 'warn-title', 'ご確認ください'));
    const ul = h('ul');
    for (const w of notes) ul.append(h('li', '', w));
    wbox.append(ul);
    box.append(wbox);
  }
  if (r.headings === 0) box.append(h('p', 'hint', '章分けしたい場合は、章の題名を「第一章」「プロローグ」のように1行で書くか、Wordの「見出し1」スタイルを設定してください。'));
  box.append(h('p', 'hint', 'KDPに登録する前に、Kindle Previewer で表示を確認してください。表紙画像はKDPの登録画面で別途設定します。'));
  show(box);
}

/** 本文照合が一致しなかった場合：成功扱いにせず、自動ダウンロードもしない */
function renderMismatch(r: ConvertResult) {
  const box = h('div', 'result ng');
  const title = h('p', 'result-title');
  title.append(h('span', 'mark', '!'), document.createTextNode('本文の照合で不一致が見つかりました'));
  box.append(
    title,
    h('p', 'result-file', r.fileName),
    h('p', 'error-msg', '変換後のEPUBの本文が元の原稿と一致しなかったため、ダウンロードを中止しました。このEPUBをそのまま出版に使わないでください。'),
  );
  if (r.verify.detail) box.append(h('p', 'hint', r.verify.detail));
  const manual = h('p', 'manual');
  const btn = h('button', 'btn-sub', '確認用にダウンロード');
  btn.type = 'button';
  btn.addEventListener('click', () => objectUrl && download(objectUrl, r.fileName));
  manual.append(h('span', '', '不一致の内容を確かめたい場合のみ：'), btn);
  box.append(manual);
  show(box);
}

function renderError(msg: string) {
  const box = h('div', 'result ng');
  const title = h('p', 'result-title');
  title.append(h('span', 'mark', '!'), document.createTextNode('変換できませんでした'));
  box.append(title, h('p', 'error-msg', msg));
  show(box);
}

async function handle(file: File) {
  if (busy) return;
  busy = true;
  drop.classList.add('busy');
  const spin = h('div', 'result');
  const p = h('p', 'result-title');
  p.append(h('span', 'spinner'), document.createTextNode(`変換しています…`));
  spin.append(p, h('p', 'result-file', file.name));
  show(spin);
  // 「変換中」を描画してから重い処理に入る
  // （タブが非表示だと requestAnimationFrame は発火しないため、タイマーでも必ず進める）
  await new Promise<void>((r) => {
    const t = setTimeout(r, 50);
    requestAnimationFrame(() => setTimeout(() => (clearTimeout(t), r()), 0));
  });

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = convert(file.name, bytes, DOMParser);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(new Blob([r.epub as BlobPart], { type: 'application/epub+zip' }));
    const o = decideOutcome(r);
    if (o.kind === 'success') renderSuccess(r);
    else renderMismatch(r);
    if (o.autoDownload) download(objectUrl, r.fileName);
  } catch (e) {
    console.error(e);
    renderError(e instanceof ConvertError ? e.message : '予期しないエラーが発生しました。ファイルが壊れていないか確認してください。');
  } finally {
    busy = false;
    drop.classList.remove('busy');
    input.value = '';
  }
}

input.addEventListener('change', () => {
  const f = input.files?.[0];
  if (f) void handle(f);
});

// ページ全体でドロップを受け付ける（ブラウザがファイルを開いてしまうのを防ぐ）
let depth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  depth++;
  drop.classList.add('over');
});
window.addEventListener('dragleave', () => {
  depth = Math.max(0, depth - 1);
  if (!depth) drop.classList.remove('over');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  drop.classList.remove('over');
  const files = e.dataTransfer?.files;
  if (files && files.length) void handle(files[0]);
});
