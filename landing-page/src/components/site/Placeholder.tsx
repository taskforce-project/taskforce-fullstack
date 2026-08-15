import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Placeholder — remplace les faux écrans produit et les images, le temps d'avoir
 * les vrais assets (décision user : « à la place des screens, des placeholders ;
 * les images aussi »).
 *
 * Volontairement neutre et STATIQUE : pas d'animation, pas de fausse UI. Un cadre
 * en pointillés, une étiquette, une proportion. C'est un trou à remplir, pas une
 * illustration — et ça se voit, ce qui est le but.
 */
export function Placeholder({
  label = "Placeholder",
  ratio = "16 / 10",
  className,
}: {
  /** Ce que l'écran final montrera (aide à savoir quoi mettre à sa place). */
  label?: string;
  /** Proportion CSS (`aspect-ratio`). */
  ratio?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${label} (placeholder)`}
      className={cn(
        "flex w-full items-center justify-center rounded-2xl border border-dashed",
        "border-[color:var(--site-border)] bg-[color:var(--site-band)]/50 text-muted-foreground",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      <span className="flex flex-col items-center gap-2 px-4 text-center text-[12.5px]">
        <ImageIcon className="size-5 opacity-45" strokeWidth={1.5} />
        {label}
      </span>
    </div>
  );
}

/** Petit carré placeholder pour un logo (mur de logos, catalogue…). */
export function LogoPlaceholder({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-md border border-dashed border-[color:var(--site-border)] bg-[color:var(--site-band)]/60",
        className,
      )}
    />
  );
}
