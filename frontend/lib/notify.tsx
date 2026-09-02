"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Helpers de notification « riches » au-dessus de sonner - des VARIATIONS selon le type d'action.
 *
 * <p>Le simple reste le simple : `toast.success` / `toast.error` (les erreurs systémiques - réseau /
 * 5xx / 429 - sont déjà toastées par l'intercepteur `lib/api/client.ts`). Ces helpers ajoutent de
 * l'« insight » quand ça a du sens :</p>
 * <ul>
 *   <li>{@link notifyUndo}     - action réversible → bouton <b>Undo</b> dans une fenêtre courte.</li>
 *   <li>{@link notifyProgress} - opération longue → <b>barre de progression</b> déterminée.</li>
 *   <li>{@link notifyRich}     - évènement notable → <b>carte de marque</b> (icône, titre, actions).</li>
 * </ul>
 *
 * <p><b>⚠️ Sécurité</b> : ne JAMAIS mettre de donnée sensible dans un toast (token, secret, e-mail
 * complet, identifiant interne, contenu privé). Un toast s'affiche à l'écran et peut être capturé -
 * rester au « quoi » (« Repository synced »), jamais au « comment » (URL/credentials).</p>
 */

// ---------------------------------------------------------------------------
// Undo - action réversible
// ---------------------------------------------------------------------------

/**
 * Toast de succès avec un bouton <b>Undo</b>. À réserver aux actions réellement réversibles
 * (le `onUndo` doit rétablir l'état - suppression différée annulable, bascule inverse, etc.).
 */
export function notifyUndo(
  message: string,
  opts: { onUndo: () => void; description?: string; duration?: number },
): string | number {
  return toast.success(message, {
    description: opts.description,
    duration: opts.duration ?? 6000,
    action: { label: "Undo", onClick: opts.onUndo },
  });
}

// ---------------------------------------------------------------------------
// Progress - opération longue à progression connue
// ---------------------------------------------------------------------------

function ProgressCard({
  title,
  description,
  pct,
}: {
  readonly title: string;
  readonly description?: string;
  readonly pct: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="flex w-[356px] max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{clamped}%</span>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Toast à barre de progression déterminée pour une opération longue à avancement connu (export,
 * traitement par lot…). Renvoie de quoi la piloter. Pour une opération SANS avancement connu,
 * préférer `toast.loading` / `toast.promise` de sonner.
 */
export function notifyProgress(
  title: string,
  opts: { description?: string } = {},
): {
  setProgress: (pct: number) => void;
  success: (message?: string) => void;
  error: (message?: string) => void;
  dismiss: () => void;
} {
  const id = toast.custom(() => <ProgressCard title={title} description={opts.description} pct={0} />, {
    duration: Infinity,
  });
  return {
    setProgress: (pct) => {
      toast.custom(() => <ProgressCard title={title} description={opts.description} pct={pct} />, {
        id,
        duration: Infinity,
      });
    },
    success: (message) => {
      toast.dismiss(id);
      toast.success(message ?? `${title} - done`);
    },
    error: (message) => {
      toast.dismiss(id);
      toast.error(message ?? `${title} - failed`);
    },
    dismiss: () => toast.dismiss(id),
  };
}

// ---------------------------------------------------------------------------
// Rich - carte de marque (icône, titre, description, actions)
// ---------------------------------------------------------------------------

/** Une action de carte riche. `onClick` reçoit un `dismiss` pour fermer le toast courant. */
export interface RichToastAction {
  readonly label: string;
  readonly onClick: (dismiss: () => void) => void;
  readonly variant?: "primary" | "outline" | "ghost";
}

export interface RichToastOptions {
  readonly title: string;
  readonly description?: string;
  /** Icône (lucide) affichée dans la pastille de gauche. */
  readonly icon?: ReactNode;
  /** Actions en pied de carte (0 à 2 recommandées). */
  readonly actions?: readonly RichToastAction[];
  /** Tonalité de la pastille d'icône. */
  readonly tone?: "primary" | "destructive" | "muted";
  readonly duration?: number;
}

function toneClasses(tone: RichToastOptions["tone"]): string {
  switch (tone) {
    case "destructive":
      return "bg-destructive/10 text-destructive";
    case "muted":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-primary/10 text-primary";
  }
}

function buttonVariant(v: RichToastAction["variant"]): "default" | "outline" | "ghost" {
  return v === "primary" ? "default" : v === "ghost" ? "ghost" : "outline";
}

/**
 * Carte de notification riche (façon shadcn « sonner-05 »), aux jetons TaskForce : pastille d'icône,
 * titre + description, bouton de fermeture, et jusqu'à deux actions. Pour un évènement notable qui
 * mérite plus qu'une ligne (nudge sécurité, intégration synchronisée, invitation à agir).
 */
export function notifyRich(opts: RichToastOptions): string | number {
  return toast.custom(
    (id) => {
      const dismiss = () => toast.dismiss(id);
      return (
        <div className="flex w-[356px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-lg backdrop-blur-md">
          <div className="flex items-start gap-3">
            {opts.icon && (
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClasses(opts.tone))}>
                {opts.icon}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-semibold tracking-tight">{opts.title}</p>
              {opts.description && <p className="text-xs leading-relaxed text-muted-foreground">{opts.description}</p>}
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {opts.actions && opts.actions.length > 0 && (
            <div className="flex gap-2">
              {opts.actions.map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant={buttonVariant(a.variant)}
                  className="h-8 flex-1 text-xs"
                  onClick={() => a.onClick(dismiss)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      );
    },
    { duration: opts.duration ?? 8000 },
  );
}
