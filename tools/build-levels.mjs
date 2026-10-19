/**
 * 把 levels/*.json 打包为内置副本 js/data/levels.embedded.js。
 *
 * 用途：在 file:// 或 fetch 不可用的环境下仍能加载关卡（双击 index.html 直接玩）。
 * 数据源仍然是 levels/*.json，这里只是生成物，不要手工编辑。
 *
 * 运行：node tools/build-levels.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = resolve(here, '../levels');
const outFile = resolve(here, '../js/data/levels.embedded.js');

const files = readdirSync(levelsDir)
  .filter((f) => /^level-\d+\.json$/.test(f))
  .sort();

const levels = files.map((f) => JSON.parse(readFileSync(resolve(levelsDir, f), 'utf8')));

const header = `/**
 * 自动生成，请勿手工编辑。
 * 数据源：levels/*.json
 * 生成命令：node tools/build-levels.mjs
 * 用途：file:// 或 fetch 不可用时的内置副本，保证双击即可游玩。
 */
`;

writeFileSync(outFile, `${header}export const LEVELS = ${JSON.stringify(levels, null, 2)};\n`, 'utf8');
console.log(`已写入 ${outFile}（${levels.length} 个关卡）`);
