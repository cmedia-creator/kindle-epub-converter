import { defineConfig, type Plugin } from 'vite';

// 本番ビルドだけ CSP を付ける：外部への通信（connect-src）を禁止し、原稿が送信されないことをブラウザに保証させる
const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
    ].join('; ');
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
};

export default defineConfig({
  base: './',
  plugins: [csp],
  build: { target: 'es2020', modulePreload: { polyfill: false } },
  test: { include: ['tests/*.test.ts'], testTimeout: 60000 },
});
