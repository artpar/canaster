import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'canaster-html-env',
      transformIndexHtml(html) {
        const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
        const publicOrigin = env.VITE_CANASTER_PUBLIC_ORIGIN || 'https://canaster.in';
        const ogImageUrl = env.VITE_CANASTER_OG_IMAGE_URL || `${publicOrigin}/og-image.svg`;
        return html
          .replace(/%VITE_CANASTER_PUBLIC_ORIGIN%/g, publicOrigin)
          .replace(/%VITE_CANASTER_OG_IMAGE_URL%/g, ogImageUrl);
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        index_with_og: 'index_with_og.html',
      },
    },
  },
});
