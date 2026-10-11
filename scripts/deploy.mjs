// dist/ を gh-pages ブランチとして origin に push する（GitHub Pages の公開元）
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

if (!existsSync('dist/index.html')) throw new Error('dist/ がありません。先に npm run build を実行してください。');
const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
const rev = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync('dist/.nojekyll', '');
const git = (...args) => execFileSync('git', args, { cwd: 'dist', stdio: 'inherit' });
git('init', '-q', '-b', 'gh-pages');
git('add', '-A');
git('-c', 'user.name=cmedia-creator', '-c', 'user.email=314237211+cmedia-creator@users.noreply.github.com', 'commit', '-qm', `deploy ${rev}`);
git('push', '-f', remote, 'gh-pages');
console.log(`deployed ${rev} to gh-pages`);
