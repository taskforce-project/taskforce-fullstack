import { BUILT_ROUTES } from "@/components/site/nav";

/**
 * sitemap.xml — généré à partir de `BUILT_ROUTES` (source unique des pages construites).
 * Ajouter une page = l'ajouter à BUILT_ROUTES, elle entre ici automatiquement. Aucune liste à tenir.
 */
const SITE = "https://taskforce.dev";

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
