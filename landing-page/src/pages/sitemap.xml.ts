import { BUILT_ROUTES } from "@/components/site/nav";

/**
 * sitemap.xml - généré à partir de `BUILT_ROUTES` (source unique des pages construites).
 * Ajouter une page = l'ajouter à BUILT_ROUTES, elle entre ici automatiquement. Aucune liste à tenir.
 */
// Même dérivation que nav.ts : suffixe (domaine) en variable d'env, défaut = domaine de prod réel.
// Ne pas coder en dur un domaine (l'ancien « taskforce.dev » sortait de mauvaises URL dans le sitemap).
const BASE_DOMAIN = (import.meta.env.PUBLIC_BASE_DOMAIN ?? "taskforce-project.fr")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const SITE = `https://${BASE_DOMAIN}`;

export function GET() {
  const paths = [...BUILT_ROUTES].sort();
  const urls = paths
    .map((p) => `  <url><loc>${SITE}${p}</loc><changefreq>weekly</changefreq></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
