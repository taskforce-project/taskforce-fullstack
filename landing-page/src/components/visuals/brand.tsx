import { BRANDS, type BrandKey } from "@/lib/brands";
import { cn } from "@/lib/utils";

/**
 * Logo d'une marque, servi par le site (aucun appel réseau), tel quel : ni pastille, ni coins arrondis. Une marque
 * sans fichier (voir lib/brands.ts) n'a pas de logo : rien n'est rendu, son nom suit en texte.
 */
export function BrandMark({ brand, className }: Readonly<{ brand: BrandKey; className?: string }>) {
  const b = BRANDS[brand];
  if (!b.file) return null;
  return (
    <img
      src={`/logos/${b.file}`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("shrink-0 object-contain select-none", className)}
    />
  );
}
