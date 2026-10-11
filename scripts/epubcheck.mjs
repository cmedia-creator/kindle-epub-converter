// out/ の全 EPUB を EPUBCheck で検証する（tools/epubcheck-*/epubcheck.jar が必要）
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const toolDir = readdirSync('tools').find((d) => d.startsWith('epubcheck-'));
const jar = toolDir && `tools/${toolDir}/epubcheck.jar`;
if (!jar || !existsSync(jar)) {
  console.error('tools/epubcheck-<version>/epubcheck.jar が見つかりません（README 参照）');
  process.exit(2);
}
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('out').filter((f) => f.endsWith('.epub')).map((f) => `out/${f}`);
let failed = 0;
for (const f of files) {
  const r = spawnSync('java', ['-Duser.language=en', '-jar', jar, '--locale', 'en', f], { encoding: 'utf8' });
  const log = r.stdout + r.stderr;
  const sum = /Messages: (.*)/.exec(log)?.[1] ?? '';
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${f}  ${sum}`);
  if (r.status !== 0 || /WARNING|ERROR|FATAL/.test(log.replace(/Messages:.*/, ''))) {
    failed += r.status === 0 ? 0 : 1;
    console.log(log.split('\n').filter((l) => /^(WARNING|ERROR|FATAL|USAGE)/.test(l)).join('\n'));
  }
}
console.log(`\n${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
