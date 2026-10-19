import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Configurazione della build e della PWA.
// Il manifest è un file statico in public/ (linkato da index.html) per restare
// ispezionabile e testabile; il service worker è generato da Workbox.
export default defineConfig({
  // Base relativa: l'app è servita dalla radice su Azure Static Web Apps e la
  // base relativa mantiene validi i riferimenti anche in anteprima.
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      includeAssets: ['favicon.svg', 'manifest.webmanifest', 'icons/*'],
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: [
          '**/*.{js,mjs,css,html,svg,png,webmanifest,json,bcmap,pfb,ttf,wasm,bin,icc}',
          'pdfjs/**/LICENSE*',
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
