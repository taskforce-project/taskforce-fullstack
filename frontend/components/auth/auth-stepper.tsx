"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";

/**
 * Fil d'étapes de l'inscription.
 *
 * Trois segments pleine largeur, **chacun sous son libellé d'un mot** : la personne voit d'un coup
 * d'œil tout le parcours (où j'en suis, ce qui reste), pas seulement l'étape courante. Les segments
 * donnent la progression, l'étape en cours est mise en avant par la couleur du libellé.
 *
 * L'état des segments est porté par `data-state` et stylé dans `globals.css` : le composant décrit la
 * structure, la feuille de style décide de l'apparence.
 */

// Clés d'étapes stables (indépendantes de la langue) : les libellés affichés sont dérivés de `t`
// dans le composant. Utilisées pour le compte de segments, les clés React et l'aria.
export const REGISTER_STEPS = ["account", "verification"] as const;

export type RegisterStep = 1 | 2;

interface AuthStepperProps {
  /** Étape en cours, de 1 à 3. */
  current: RegisterStep;
}

export function AuthStepper({ current }: AuthStepperProps) {
  const { t } = usePreferencesStore();
  const total = REGISTER_STEPS.length;
  const stepLabels = [t.auth.ui.stepAccount, t.auth.ui.stepVerification];
  const currentLabel = stepLabels[current - 1] ?? "";

  return (
    <div
      className="mb-4"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={t.auth.ui.stepAria
        .replace("{current}", String(current))
        .replace("{total}", String(total))
        .replace("{label}", currentLabel)}
    >
      <div className="auth-steps">
        {REGISTER_STEPS.map((label, index) => {
          const position = index + 1;
          const state =
            position < current ? "done" : position === current ? "current" : "todo";
          return <span key={label} className="auth-step-seg" data-state={state} />;
        })}
      </div>

      {/* Un libellé par segment (gap identique : 0.375rem) - le parcours est lisible d'entrée. */}
      <div className="mt-2 flex gap-1.5">
        {REGISTER_STEPS.map((label, index) => {
          const position = index + 1;
          return (
            <span
              key={label}
              className="flex-1 text-[11px] font-medium leading-none"
              style={{
                color:
                  position === current
                    ? "var(--label-primary)"
                    : position < current
                      ? "var(--label-secondary)"
                      : "var(--label-quaternary)",
              }}
            >
              {stepLabels[index]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
