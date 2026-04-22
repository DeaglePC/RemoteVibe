import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * 生成一个构建 ID：优先使用环境变量（CI 注入），否则使用时间戳。
 * 注意：不能使用 Date.now().toString() 作为默认值时不稳定的场景——这里每次 build 都会变，
 * 正合其用，以便 SW 能检测到新版本。
 */
function resolveBuildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID;
  return Date.now().toString(36);
}

const BUILD_ID = resolveBuildId();

/**
 * Vite 插件：在 bundle 输出完成后，将 public/sw.js 中的 __BUILD_ID__ 占位符
 * 替换为本次构建的真实版本号，保证 Service Worker 可以按版本清理旧缓存。
 */
function swVersionPlugin() {
  return {
    name: 'sw-version-inject',
    apply: 'build' as const,
    async closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      try {
        const source = await readFile(swPath, 'utf8');
        const patched = source.replace(/__BUILD_ID__/g, BUILD_ID);
        await writeFile(swPath, patched, 'utf8');
        // eslint-disable-next-line no-console
        console.log(`[sw-version-inject] patched dist/sw.js with BUILD_ID=${BUILD_ID}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[sw-version-inject] skip:', (err as Error).message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swVersionPlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:3710',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3710',
      },
    },
  },
})
