/**
 * sitemap.xml : les pages tirées des fichiers de `src/pages`, sauf celles construites en `noindex` (404, page d'au
 * revoir du désinstalleur). Une page ajoutée ou retirée met le sitemap à jour d'elle-même ; les anciennes adresses
 * (redirections de vercel.json) n'y figurent pas.
 *
 * Ni `lastmod` ni `priority` : le site est reconstruit à chaque release desktop, une date de build dirait que toutes
 * les pages changent à chaque fois, et Google ignore `priority`.
 * Domaine lu dans PUBLIC_BASE_DOMAIN, comme `site` dans astro.config.mjs.
 */
const BASE_DOMAIN = (import.meta.env.PUBLIC_BASE_DOMAIN ?? "taskforce-project.fr")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const SITE = `https://${BASE_DOMAIN}`;

// Source de chaque page, pour repérer la prop `noindex` passée à BaseLayout.
const SOURCES = import.meta.glob<string>("./**/*.astro", { query: "?raw", import: "default", eager: true });

const PATHS = Object.entries(SOURCES)
  .filter(([file, source]) => !file.includes("[") && !/<BaseLayout\b[^>]*\bnoindex\b/.test(source))
  .map(([file]) => file.slice(1).replace(/\.astro$/, "").replace(/\/index$/, "") || "/")
  .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));

export function GET() {
  const urls = PATHS.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
