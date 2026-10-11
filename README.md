# 縦書きEPUBメーカー（kindle-epub-converter）

日本語の小説原稿（Word `.docx` / テキスト `.txt`）を、Kindle Direct Publishing（KDP）に登録できる **縦書き EPUB3** に変換する無料 Web ツールです。

**公開URL：https://cmedia-creator.github.io/kindle-epub-converter/**

原稿ファイルを選ぶ（またはドロップする）と、その場で変換が始まり、`.epub` が自動でダウンロードされます。登録・設定・確認画面はありません。

> Amazon.com, Inc. およびその関連会社とは関係のない、非公式のツールです。

## 特長

- **原稿を外部に送信しません。** 変換はすべてブラウザの中で行います。サーバー側の処理はなく、公開ページには `connect-src 'none'` の Content-Security-Policy を設定しているため、ページから外部への通信自体がブラウザによって禁止されます。
- **本文を書き換えません。** AI による校正・加筆・要約は行いません。段落・空行・句読点・三点リーダー・ダッシュ・括弧などはそのまま保持します。
- **本文照合。** 変換後の EPUB を読み直し、元原稿のテキストと一致するかを毎回確認して結果を表示します。
- 省略した要素（画像・テキストボックス・脚注など）は黙って消さず、画面で警告します。

## 出力される EPUB

| 項目 | 内容 |
|---|---|
| 形式 | EPUB 3（リフロー型） |
| 組方向 | 縦書き（`writing-mode: vertical-rl`）・右開き（`page-progression-direction="rtl"`）・`primary-writing-mode` 指定 |
| 目次 | EPUB3 ナビゲーション文書 ＋ NCX（章が 2 つ以上あるときは本文の前に目次ページ） |
| 書名 | ファイル名から設定（拡張子を除く） |
| 言語 | `ja` |
| 表紙 | なし（KDP の登録画面で別途アップロードします） |

## 対応している原稿の書き方

### 章見出し（目次になるもの）

- Word の「見出し 1〜3」スタイル（またはアウトラインレベル）
- 見出しスタイルがない場合や TXT では、1 行だけの次の形式を見出しとみなします
  - `第一章`、`第1話　タイトル`、`第三部`、`12章` など
  - `プロローグ`、`エピローグ`、`序章`、`終章`、`幕間`、`あとがき` など
  - TXT の `# 見出し`（Markdown 形式。`#` の数で階層）
- 見出しが見つからない場合は章分けをしません（無理に分割しません）。

### ルビ・強調

- Word のルビ（ルビ機能で付けたもの）、傍点（圏点）、太字、斜体、下線、取り消し線
- 小説投稿サイトで一般的なルビ記法：`｜親文字《るび》`、`漢字《かんじ》`
- 縦書きで横に寝てしまう半角の 1〜2 桁の数字と `!!` `!?` は縦中横にします（文字は変えません）

### 文字コード（TXT）

UTF-8（BOM あり/なし）、Shift_JIS（CP932）、EUC-JP、UTF-16（BOM あり）を自動判定します。改行コードは CRLF / LF / CR いずれも可。

## 対応していないもの

- 古い Word 形式（`.doc`）、PDF、RTF、ODT、Pages → `.docx` か `.txt` で保存し直してください
- 画像・図形・テキストボックス・脚注・数式（警告を表示して省略）
- 表（表の形ではなく通常の段落として出力）
- 表紙画像の生成・挿入

## 開発

```bash
npm install
npm run dev        # 開発サーバー
npm test           # 自動テスト（tests/fixtures の原稿を変換して検証。out/ に EPUB を出力）
npm run epubcheck  # out/ の EPUB を EPUBCheck で検証（tools/epubcheck-5.4.0/ に EPUBCheck を展開しておく）
npm run build      # dist/ に本番ビルド
npm run fixtures   # テスト原稿の再生成（iconv が必要）
```

公開は `npm run deploy`（ビルドして `gh-pages` ブランチへ push）で行います。

`ci/deploy.yml` は、テスト → EPUBCheck → ビルド → Pages 公開を自動で行う GitHub Actions の定義です。使う場合は `gh auth refresh -s workflow` で権限を追加し、`.github/workflows/` に移してください。

### 構成

- `src/core/txt.ts` … 文字コード判定、TXT の解析
- `src/core/docx.ts` … DOCX（WordprocessingML）の解析
- `src/core/headings.ts` … 章見出しの判定
- `src/core/inline.ts` … ルビ記法・縦中横・XHTML 化
- `src/core/epub.ts` … EPUB パッケージ生成
- `src/core/verify.ts` … 本文照合（生成した XHTML を読み直して原稿と比較）
- `src/main.ts` … 画面

使用ライブラリは [fflate](https://github.com/101arrowz/fflate)（ZIP の読み書き）のみ。ビルドには Vite / TypeScript、テストには Vitest と @xmldom/xmldom を使います。外部 CDN には依存しません。

## ライセンス

MIT
