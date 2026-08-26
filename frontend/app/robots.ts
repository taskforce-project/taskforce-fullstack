import type { MetadataRoute } from "next"

/**
 * robots.txt de l'app (app.taskforce-project.fr). Sans cette route, `/robots.txt` était capté par le
 * catch-all `[workspace]` et renvoyait le HTML du SPA → « Unknown directive » (audit SEO `robots-txt`
 * en échec). L'app est PRIVÉE (tout est derrière l'auth) : on interdit l'indexation — c'est à la fois
 * valide (corrige l'audit) et correct (rien à indexer ici ; la vitrine publique a son propre robots).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  }
}
