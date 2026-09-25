import { cn } from "@/lib/utils";

/**
 * BrandLogo - logos de marque vendorisés depuis SVGL.
 * Les fichiers viennent de `frontend/public/logos/` (générés par `npm run logos` côté webapp),
 * recopiés dans `landing-page/public/logos/`. Même source que le catalogue de connecteurs :
 * un logo présent dans l'app est présent ici.
 *
 * SVGL livre parfois deux variantes : `route.light` (logo prévu POUR un fond clair) et
 * `route.dark`. Le site étant light-only, on prend systématiquement `-light`.
 */

/** Marques ayant deux variantes sur disque (`<key>-light.svg` / `<key>-dark.svg`). */
const THEMED = new Set([
  "1password",
  "anthropic",
  "aws",
  "clerk",
  "copilot",
  "cursor",
  "framer",
  "github",
  "mongodb-atlas",
  "ollama",
  "openai",
  "planetscale",
  "prisma",
  "railway",
  "render",
  "replicate",
  "resend",
  "sketch",
  "vercel",
  "windsurf",
  "zed",
  "v0",
]);

export function logoSrc(key: string) {
  return THEMED.has(key) ? `/logos/${key}-light.svg` : `/logos/${key}.svg`;
}

export function BrandLogo({
  brand,
  label,
  className,
  loading = "lazy",
}: {
  /** Clé du catalogue de connecteurs (ex. `github`, `linear`). */
  brand: string;
  /** Nom lisible - sert d'alternative textuelle quand le logo porte l'information.
   *  Passer `""` quand le nom est déjà écrit à côté (logo décoratif, pas de double lecture). */
  label: string;
  className?: string;
  /** `eager` au-dessus de la ligne de flottaison (hero), `lazy` partout ailleurs. */
  loading?: "lazy" | "eager";
}) {
  return (
    <img
      src={logoSrc(brand)}
      alt={label}
      loading={loading}
      decoding="async"
      className={cn("h-6 w-auto object-contain", className)}
    />
  );
}
