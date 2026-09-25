import { Bot } from "lucide-react";
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

/**
 * Marques nommées en texte, jamais par leur logo (même vendorisé) : les conditions d'Anthropic interdisent
 * d'utiliser son logo sans permission (ADR-013, `taskforce-runner/README.md`). Même règle dans l'app
 * (`frontend/components/ui/brand-logo.tsx`).
 */
const NAME_ONLY = new Set(["anthropic"]);

/** URL du logo d'une marque, ou `null` quand on ne doit pas l'afficher ({@link NAME_ONLY}). */
export function logoSrc(key: string): string | null {
  if (NAME_ONLY.has(key)) return null;
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
  const src = logoSrc(brand);
  if (!src) {
    // Glyphe neutre « agent » : garde le rythme d'un mur de logos ou d'une colonne, sans marque.
    return (
      <Bot
        role={label ? "img" : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : true}
        strokeWidth={1.75}
        className={cn("text-muted-foreground aspect-square h-6 w-auto shrink-0", className)}
      />
    );
  }
  return (
    <img
      src={src}
      alt={label}
      loading={loading}
      decoding="async"
      className={cn("h-6 w-auto object-contain", className)}
    />
  );
}
