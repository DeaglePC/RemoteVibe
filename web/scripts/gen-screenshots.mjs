// scripts/gen-screenshots.mjs
// 生成 PWA store 展示图占位：
//   - 桌面版 desktop.png (1920×1080, form_factor=wide)
//   - 手机版 phone.png   (1080×1920, form_factor=narrow)
// 用法：node scripts/gen-screenshots.mjs
// 注意：这只是品牌色渐变占位；正式上架前请用真实产品截图覆盖。

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/screenshots');

const BRAND_FROM = '#6d4ad4';
const BRAND_TO = '#22c8d4';
const BG_DARK = '#13051b';

/**
 * 生成展示图 SVG 字符串
 * @param {number} width
 * @param {number} height
 * @param {string} label 中央大字
 * @param {string} subtitle 底部说明文案
 */
function screenshotSvg(width, height, label, subtitle) {
  const cx = width / 2;
  const cy = height / 2;
  const labelSize = Math.round(Math.min(width, height) * 0.12);
  const subtitleSize = Math.round(Math.min(width, height) * 0.035);
  const cardPadding = Math.round(Math.min(width, height) * 0.08);
  const cardRadius = Math.round(Math.min(width, height) * 0.04);
  const cardW = width - cardPadding * 2;
  const cardH = height - cardPadding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_FROM}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${BRAND_TO}" stop-opacity="0.10"/>
    </linearGradient>
    <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_FROM}"/>
      <stop offset="100%" stop-color="${BRAND_TO}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${BG_DARK}"/>
  <rect x="${cardPadding}" y="${cardPadding}" width="${cardW}" height="${cardH}" rx="${cardRadius}" ry="${cardRadius}" fill="url(#bg)" stroke="url(#brand)" stroke-opacity="0.4" stroke-width="2"/>
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-size="${labelSize}" font-weight="700" fill="url(#brand)">${label}</text>
  <text x="${cx}" y="${cy + labelSize}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-size="${subtitleSize}" fill="#ffffff" fill-opacity="0.65">${subtitle}</text>
</svg>`;
}

/**
 * @param {string} svg
 * @param {string} outPath
 * @param {number} width
 * @param {number} height
 */
async function renderPng(svg, outPath, width, height) {
  await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ✔ ${outPath}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  await renderPng(
    screenshotSvg(1920, 1080, 'BaoMiHua', 'Agent Gateway · Desktop'),
    resolve(outDir, 'desktop.png'),
    1920,
    1080,
  );
  await renderPng(
    screenshotSvg(1080, 1920, 'BaoMiHua', 'Agent Gateway · Mobile'),
    resolve(outDir, 'phone.png'),
    1080,
    1920,
  );

  console.log('\nAll screenshots generated (placeholder, please replace with real captures).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
