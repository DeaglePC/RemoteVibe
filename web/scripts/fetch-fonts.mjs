// scripts/fetch-fonts.mjs
// 下载 Inter + JetBrains Mono 的 woff2 子集到 web/public/fonts/
// 用法：node scripts/fetch-fonts.mjs
// 仅在字体配置需要变更时手动运行；下载结果不入库（见 .gitignore）。
//
// 策略：
//  1. 向 Google Fonts CSS2 API 发请求（伪装成现代浏览器 UA 以拿 woff2）
//  2. 从返回的 CSS 里提取每段 @font-face 的 woff2 URL（排除 cyrillic/vietnamese 等冷门字符集）
//  3. 下载并按「族名-字重-字符集.woff2」保存
//  4. 同时生成 web/src/styles/fonts.generated.css 供 index.css @import

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const outFontsDir = resolve(projectRoot, 'public/fonts');
const outCssPath = resolve(projectRoot, 'src/styles/fonts.generated.css');

// 模拟现代 Chrome，以确保拿到 woff2 而非 woff
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 需要保留的字符集（只留拉丁基础 + 拉丁扩展，已经能覆盖英文 + 欧洲语）
// 中文通过 system-ui 兜底，不本地化中文以控制体积
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * @param {string} url
 * @param {string} outPath
 */
async function downloadBinary(url, outPath) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(outPath, buf);
  console.log(`  ✔ ${outPath} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
}

/**
 * 解析 Google Fonts CSS，拆出每段 @font-face 的元数据
 * @param {string} css
 * @returns {Array<{ subset: string, url: string, unicodeRange: string, weight: string, style: string }>}
 */
function parseFontFaces(css) {
  const blocks = [];
  const blockRegex = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/gi;
  let match;
  while ((match = blockRegex.exec(css)) !== null) {
    const subset = match[1];
    const body = match[2];
    const url = /url\(([^)]+)\)\s*format\('woff2'\)/i.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/i.exec(body)?.[1].trim() ?? '';
    const weight = /font-weight:\s*([^;]+);/i.exec(body)?.[1].trim() ?? '400';
    const style = /font-style:\s*([^;]+);/i.exec(body)?.[1].trim() ?? 'normal';
    if (url) {
      blocks.push({ subset, url, unicodeRange, weight, style });
    }
  }
  return blocks;
}

/**
 * 下载单个族的所有 woff2 + 生成 @font-face 片段
 * @param {string} family 族名（CSS 里使用）
 * @param {string} cssQuery Google Fonts 的 family 请求串，如 "Inter:wght@400;500;600"
 * @param {string} fileBase 文件名前缀，如 "inter"
 * @returns {Promise<string>} 该族对应的 @font-face 文本
 */
async function fetchFamily(family, cssQuery, fileBase) {
  console.log(`\n→ ${family}`);
  const apiUrl = `https://fonts.googleapis.com/css2?family=${cssQuery}&display=swap`;
  const css = await fetchText(apiUrl);
  const faces = parseFontFaces(css).filter((f) => KEEP_SUBSETS.has(f.subset));

  const fontFaces = [];
  for (const f of faces) {
    const fileName = `${fileBase}-${f.weight}-${f.subset}.woff2`;
    const outPath = resolve(outFontsDir, fileName);
    await downloadBinary(f.url, outPath);
    fontFaces.push(
      [
        '@font-face {',
        `  font-family: '${family}';`,
        `  font-style: ${f.style};`,
        `  font-weight: ${f.weight};`,
        '  font-display: swap;',
        `  src: url('/fonts/${fileName}') format('woff2');`,
        `  unicode-range: ${f.unicodeRange};`,
        '}',
      ].join('\n'),
    );
  }
  return fontFaces.join('\n\n');
}

async function main() {
  await mkdir(outFontsDir, { recursive: true });
  await mkdir(dirname(outCssPath), { recursive: true });

  const interCss = await fetchFamily('Inter', 'Inter:wght@400;500;600;700', 'inter');
  const jetbrainsCss = await fetchFamily(
    'JetBrains Mono',
    'JetBrains+Mono:wght@400;500',
    'jetbrains-mono',
  );

  const header =
    '/* 由 scripts/fetch-fonts.mjs 自动生成，勿手动修改。 */\n' +
    '/* 重新生成：npm run fetch:fonts */\n\n';
  await writeFile(outCssPath, header + interCss + '\n\n' + jetbrainsCss + '\n', 'utf8');
  console.log(`\n✔ ${outCssPath}`);
  console.log('\nAll fonts downloaded successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
