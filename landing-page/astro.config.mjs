// @ts-nocheck
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// Domaine de prod dérivé de PUBLIC_BASE_DOMAIN (même source que src/components/site/nav.ts) ;
// défaut = domaine réel. Évite de coder en dur un domaine périmé (ex. l'ancien « taskforce.dev »)
// qui polluerait les URL canoniques et l'OpenGraph.
const BASE_DOMAIN = (process.env.PUBLIC_BASE_DOMAIN || 'taskforce-project.fr')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

// https://astro.build/config
export default defineConfig({
  site: `https://${BASE_DOMAIN}`,
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