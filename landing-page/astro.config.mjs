// @ts-nocheck
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://taskforce.dev',
  vite: {
      plugins: [tailwindcss()],
      // Dédup React — hygiène : évite toute double instance de React dans les îlots.
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
      server: {
        watch: {
          usePolling: true,
          interval: 1000,
        },
      },
	},

  integrations: [react()],
});