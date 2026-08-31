import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AppShot - un CADRE d'application VIDE, prêt à recevoir une VRAIE capture du produit.
 *
 * Décision user (phase design) : les moments de PREUVE / CONFIANCE (« du dur, de l'argument »)
 * montrent l'app RÉELLE, pas une animation. On pose donc un cadre propre - barre de fenêtre +
 * corps neutre, AUCUN placeholder pointillé « à la Placeholder » - que l'équipe remplira avec la
 * capture. Les `children` sont des overlays (toasts / callouts custom) posés PAR-DESSUS : c'est le
 * pattern « vrai screen + petits toasts » demandé.
 *
 * Pour insérer la capture : remplacer le corps par `<img src=… className="absolute inset-0 …" />`,
 * les overlays restent au-dessus.
 */
export function AppShot({
  chrome,
  ratio = "16 / 9",
  className,
  children,
}: {
  /** URL / titre affiché dans la barre de fenêtre (dit QUEL écran de l'app c'est). */
  chrome?: string;
  /** Proportion CSS du corps (`aspect-ratio`). */
  ratio?: string;
  className?: string;
  /** Overlays posés au-dessus du corps : toasts, callouts, curseur… */
  children?: ReactNode;
}) {
  return (
    <figure className={cn("bg-card m-0 overflow-hidden rounded-2xl border shadow-lg", className)}>
      {/* Barre de fenêtre */}
      <div className="bg-secondary/60 flex items-center gap-2 border-b px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        {chrome && (
          <span className="bg-card text-muted-foreground mx-auto max-w-[75%] truncate rounded-md border px-3 py-0.5 text-[11px]">
            {chrome}
          </span>
        )}
      </div>

      {/* Corps VIDE = emplacement de la vraie capture. Overlays custom par-dessus. */}
      <div className="relative" style={{ aspectRatio: ratio }}>
        <div
          aria-hidden
          className="absolute inset-0 [background:radial-gradient(120%_120%_at_50%_0%,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_70%)]"
        />
        {children}
      </div>
    </figure>
  );
}

/**
 * Toast - petit callout custom posé sur un AppShot (ou n'importe quel conteneur `relative`).
 * Sobre : bordure, ombre, une icône optionnelle. Purement démonstratif.
 */
export function Toast({
  className,
  icon,
  children,
}: {
  className?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-card absolute flex items-center gap-2 rounded-lg border px-3 py-2 shadow-md",
        className,
      )}
    >
      {icon}
      <span className="text-foreground text-[12.5px] leading-4">{children}</span>
    </div>
  );
}
