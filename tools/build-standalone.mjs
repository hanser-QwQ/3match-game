/**
 * 单文件构建器（离线分发用）
 *
 * 把 index.html + CSS + 全部 ES 模块 + 关卡数据内联为一个可直接双击打开的 HTML。
 * 源工程仍然是多文件的 ES 模块结构，这里只做打包，不改变任何业务逻辑。
 *
 * 运行：node tools/build-standalone.mjs
 * 产物：dist/三消小径.html
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'js/main.js');

const toId = (absPath) => relative(root, absPath).replace(/\\/g, '/');
const modules = new Map();

/** 解析 import 的说明符为工程内绝对路径 */
function resolveSpec(fromAbs, spec) {
  if (!spec.startsWith('.')) throw new Error(`不支持裸模块 ${spec}`);
  let target = resolve(dirname(fromAbs), spec);
  if (!existsSync(target) && existsSync(`${target}.js`)) target = `${target}.js`;
  if (!existsSync(target)) throw new Error(`找不到模块 ${spec}（来自 ${toId(fromAbs)}）`);
  return target;
}

function collect(absPath) {
  const id = toId(absPath);
  if (modules.has(id)) return id;
  const src = readFileSync(absPath, 'utf8');
  const record = { id, src, deps: [] };
  modules.set(id, record);

  const specRe = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = specRe.exec(src)) !== null) {
    const depAbs = resolveSpec(absPath, m[1]);
    record.deps.push(collect(depAbs));
  }
  return id;
}

collect(entry);
// 关卡内置副本通过动态 import 加载，静态分析抓不到，这里显式加入打包
collect(resolve(root, 'js/data/levels.embedded.js'));

const exportRe = {
  var: /^export\s+(const|let)\s+([A-Za-z0-9_$]+)/gm,
  fn: /^export\s+function\s+([A-Za-z0-9_$]+)/gm,
  cls: /^export\s+class\s+([A-Za-z0-9_$]+)/gm,
  list: /^export\s+\{([^}]+)\};?/gm,
};

function transform(record) {
  let code = record.src;
  const names = new Set();

  // import { A, B } from './x.js'  →  const { A, B } = __req('js/x.js')
  code = code.replace(
    /import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_all, list, spec) => {
      const id = toId(resolveSpec(resolve(root, record.id), spec));
      const clean = list.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
      return `const { ${clean} } = __req(${JSON.stringify(id)});`;
    }
  );

  code = code.replace(exportRe.var, (_all, kw, name) => {
    names.add(name);
    return `${kw} ${name}`;
  });
  code = code.replace(exportRe.fn, (_all, name) => {
    names.add(name);
    return `function ${name}`;
  });
  code = code.replace(exportRe.cls, (_all, name) => {
    names.add(name);
    return `class ${name}`;
  });
  code = code.replace(exportRe.list, (_all, list) => {
    list.split(',').forEach((item) => {
      const name = item.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    });
    return '';
  });

  if (/^\s*export\s+/m.test(code) || /\bexport\s+default\b/.test(code)) {
    throw new Error(`模块 ${record.id} 存在未能转换的 export 语句`);
  }

  const tail = [...names].map((n) => `exports.${n} = ${n};`).join('\n');
  return `__modules[${JSON.stringify(record.id)}] = function (exports, __req) {\n${code}\n${tail}\n};`;
}

// 依赖优先排序
const ordered = [];
const seen = new Set();
function visit(id) {
  if (seen.has(id)) return;
  seen.add(id);
  for (const dep of modules.get(id).deps) visit(dep);
  ordered.push(id);
}
visit(toId(entry));
visit('js/data/levels.embedded.js');

const bundle = ordered.map((id) => transform(modules.get(id))).join('\n\n');

const runtime = `
(function () {
  var __modules = {};
  var __cache = {};

  function __req(id) {
    if (id in __cache) return __cache[id];
    var mod = __modules[id];
    if (!mod) throw new Error('模块未打包：' + id);
    var exports = {};
    __cache[id] = exports;
    mod(exports, __req);
    return exports;
  }

${bundle}

  window.__M3_EMBEDDED_LEVELS__ = __req('js/data/levels.embedded.js').LEVELS;
  __req('js/main.js');
})();
`;

let html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'css/style.css'), 'utf8');

html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/\s*<link rel="icon"[^>]*>/, '');
// 移除 file:// 守卫：单文件版本就是为 file:// 准备的，保留守卫会在本地自我跳转
html = html.replace(/\s*<!-- file-guard:start -->[\s\S]*?<!-- file-guard:end -->/, '');
// 用内联运行时替换入口脚本
html = html.replace(
  /\s*<!-- entry:start -->[\s\S]*?<!-- entry:end -->/,
  `\n<script>window.__M3_STANDALONE__ = true;</script>\n<script>${runtime}</script>`
);
html = html.replace(
  '<link rel="stylesheet" href="css/style.css" />',
  `<style>\n${css}\n</style>`
);
html = html.replace(
  '<meta name="theme-color" content="#f6f1e7" />',
  '<meta name="theme-color" content="#f6f1e7" />\n<!-- 单文件构建产物：可直接双击打开，无需本地服务器 -->'
);

// 构建自检：产物里不应残留任何外部脚本、样式或入口标记
const leftovers = [
  ['入口标记', /<!-- (entry|file-guard):(start|end) -->/],
  ['外部脚本', /<script[^>]+src=/],
  ['外部样式', /<link[^>]+stylesheet/],
];
for (const [name, re] of leftovers) {
  if (re.test(html)) throw new Error(`单文件构建失败：仍存在${name}`);
}

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = resolve(root, 'dist/三消小径.html');
writeFileSync(out, html, 'utf8');
console.log(`已生成 ${out}（${(html.length / 1024).toFixed(1)} KB，${ordered.length} 个模块）`);
