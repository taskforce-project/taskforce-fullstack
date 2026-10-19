/**
 * sitemap.xml : les pages indexables du site. La 404 et les anciennes adresses (redirections) n'y figurent pas.
 * Domaine lu dans PUBLIC_BASE_DOMAIN, comme `site` dans astro.config.mjs.
 */
const BASE_DOMAIN = (import.meta.env.PUBLIC_BASE_DOMAIN ?? "taskforce-project.fr")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const SITE = `https://${BASE_DOMAIN}`;

const PAGES: { path: string; priority: string }[] = [
  { path: "/", priority: "1.0" },
  { path: "/download", priority: "0.9" },
  { path: "/features", priority: "0.8" },
  { path: "/agents", priority: "0.8" },
  { path: "/security", priority: "0.7" },
  { path: "/migrate", priority: "0.6" },
  { path: "/legal/notice", priority: "0.3" },
  { path: "/legal/privacy", priority: "0.3" },
  { path: "/legal/terms", priority: "0.3" },
  { path: "/code-signing-policy", priority: "0.3" },
];

export function GET() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map(
    (p) => `  <url><loc>${SITE}${p.path}</loc><lastmod>${lastmod}</lastmod><priority>${p.priority}</priority></url>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
