// Vite build for the MothX Desktop renderer.
//
// The Desktop renderer is a standalone React + shadcn/ui + Tailwind CSS app
// (desktop/renderer). It is intentionally independent from the serve Web UI in
// ui/. The Electron main process loads the built output through `loadFile`
// (file:// protocol), so the bundle must stay a *classic* single-file script:
// ES module scripts are blocked by CORS on file:// origins. The plugin below
// strips `type="module"`/`crossorigin` from the generated HTML and Rollup is
// configured to inline everything into one IIFE bundle.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const rendererRoot = fileURLToPath(new URL('.', import.meta.url));

// Emit file://-compatible HTML: no module scripts, no CORS attributes.
function classicFileHtml(): Plugin {
  return {
    name: 'mothx-classic-file-html',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module"([^>]*)>/g, '<script$1>')
        .replace(/<script([^>]*) type="module"([^>]*)>/g, '<script$1$2>')
        .replace(/\s+crossorigin(?=[\s>])/g, '');
    },
  };
}

export default defineConfig({
  root: rendererRoot,
  base: './',
  plugins: [react(), tailwindcss(), classicFileHtml()],
  resolve: {
    alias: {
      '@': join(rendererRoot, 'src'),
    },
  },
  build: {
    outDir: join(rendererRoot, '..', 'dist', 'renderer'),
    // The dist root is owned by scripts/build.ts / scripts/dev.ts (they also
    // emit main.cjs/preload.cjs and the renderer-ready signal file).
    emptyOutDir: false,
    target: 'chrome120',
    cssCodeSplit: false,
    // 单文件 IIFE 是 file:// 运行的硬约束;体积警告对桌面应用没有意义。
    chunkSizeWarningLimit: 1600,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: join(rendererRoot, 'index.html'),
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'main.js',
        assetFileNames: (asset) => (asset.names?.[0] === 'style.css' ? 'styles.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
});
