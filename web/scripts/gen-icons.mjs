// scripts/gen-icons.mjs
// 一次性生成 PWA 图标（标准 any + maskable），基于品牌色渐变。
// 用法：node scripts/gen-icons.mjs
// 仅在图标设计需要变更时手动运行。

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/icons');

// 品牌色（和 oklch 深紫→电子青近似的十六进制表达，librsvg 兼容）
const BRAND_FROM = '#6d4ad4'; // 近似 oklch(0.55 0.20 270)
const BRAND_TO = '#22c8d4';   // 近似 oklch(0.72 0.18 195)
const BG_DARK = '#13051b';    // 深色背景基准

/**
 * 生成标准图标 SVG（purpose=any）：整图完全可见，圆角矩形做容器
 * @param {number} size 尺寸（正方形边长）
 */
function anySvg(size) {
  const radius = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.5);
  const textY = Math.round(size * 0.65);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_FROM}"/>
      <stop offset="100%" stop-color="${BRAND_TO}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <text x="${size / 2}" y="${textY}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="${fontSize}" text-anchor="middle" fill="#ffffff">BM</text>
</svg>`;
}

/**
 * 生成 maskable 图标 SVG：为 Android adaptive icon 保留 20% 安全区
 * 画布整体铺满底色，内部留 safe area（中心 80% 区域），防止被裁切。
 * @param {number} size 尺寸
 */
function maskableSvg(size) {
  const safePadding = Math.round(size * 0.1); // 10% 上下左右安全边距（总计 20%）
  const innerSize = size - safePadding * 2;
  const innerRadius = Math.round(innerSize * 0.18);
  const fontSize = Math.round(innerSize * 0.5);
  const textY = Math.round(safePadding + innerSize * 0.65);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_FROM}"/>
      <stop offset="100%" stop-color="${BRAND_TO}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="${BG_DARK}"/>
  <rect x="${safePadding}" y="${safePadding}" width="${innerSize}" height="${innerSize}" rx="${innerRadius}" ry="${innerRadius}" fill="url(#g)"/>
  <text x="${size / 2}" y="${textY}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="${fontSize}" text-anchor="middle" fill="#ffffff">BM</text>
</svg>`;
}

/**
 * 渲染 SVG 字符串到 PNG 文件
 * @param {string} svg SVG 源
 * @param {string} outPath 输出文件路径
 * @param {number} size 尺寸（正方形边长）
 */
async function renderPng(svg, outPath, size) {
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`✔ ${outPath}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const sizes = [192, 512];
  const tasks = [];
  for (const size of sizes) {
    tasks.push(renderPng(anySvg(size), resolve(outDir, `icon-${size}.png`), size));
    tasks.push(renderPng(maskableSvg(size), resolve(outDir, `maskable-${size}.png`), size));
  }
  await Promise.all(tasks);
  console.log('\nAll icons generated successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
