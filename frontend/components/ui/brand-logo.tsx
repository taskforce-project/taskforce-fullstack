import { cn } from "@/lib/utils"
import { BRAND_LOGOS } from "@/lib/brand-logos.generated"

interface BrandLogoProps {
  /** Clé de la marque / connecteur (ex. "github", "slack") - cf. ConnectorCatalog.java. */
  slug: string
  /** Nom lisible (alt + repli initiales). */
  name: string
  /** Taille via une classe `size-*` (défaut `size-6`). */
  className?: string
}

/** Initiales de repli quand la marque n'a pas de logo vendorisé. */
function initials(name: string): string {
  return name.replaceAll(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"
}

/**
 * Logo de marque servi **localement** depuis `public/logos/` (vendorisé via SVGL -
 * cf. `scripts/fetch-logos.mjs`, `npm run logos`). Aucun appel réseau au runtime.
 *  - `themed`  → variante claire/sombre commutée par le thème (pas de flash JS).
 *  - `single`  → un seul fichier (logo couleur).
 *  - `mono`    → logo monochrome (blanc/noir) rendu via masque CSS + `currentColor` (thème-adaptatif).
 *  - inconnu   → initiales (repli neutre).
 */
export function BrandLogo({ slug, name, className }: Readonly<BrandLogoProps>) {
  const kind = BRAND_LOGOS[slug]
  const size = className ?? "size-6"

  if (kind === "themed") {
    return (
      <span role="img" aria-label={name} className={cn("inline-flex items-center justify-center", size)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/logos/${slug}-light.svg`} alt="" loading="lazy" className="size-full object-contain dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/logos/${slug}-dark.svg`} alt="" loading="lazy" className="hidden size-full object-contain dark:block" />
      </span>
    )
  }

  if (kind === "mono") {
    // Masque = silhouette du logo (canal alpha), peinte en `currentColor` → lisible sur tout thème.
    const mask = `url(/logos/${slug}.svg) center / contain no-repeat`
    return (
      <span
        role="img"
        aria-label={name}
        className={cn("inline-block bg-current", size)}
        style={{ mask, WebkitMask: mask }}
      />
    )
  }

  if (kind === "single") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/logos/${slug}.svg`} alt={name} loading="lazy" className={cn("object-contain", size)} />
    )
  }

  return (
    <span aria-label={name} className={cn("inline-flex items-center justify-center font-bold text-foreground", size)}>
      {initials(name)}
    </span>
  )
}
