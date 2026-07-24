"use client";

/**
 * Fil d'étapes de l'inscription.
 *
 * Trois segments pleine largeur plutôt que des pastilles numérotées. L'information utile pour la
 * personne qui s'inscrit est « où j'en suis et combien il reste », pas « cette étape porte le
 * numéro 2 » — le libellé de l'étape courante suffit à la nommer. Les segments donnent la
 * progression d'un coup d'œil sans occuper de hauteur, ce qui compte sur une page qui ne doit pas
 * défiler.
 *
 * L'état est porté par `data-state` et stylé dans `globals.css` : le composant décrit la structure,
 * la feuille de style décide de l'apparence.
 */

export const REGISTER_STEPS = ["Votre compte", "Votre formule", "Vérification"] as const;

export type RegisterStep = 1 | 2 | 3;

interface AuthStepperProps {
  /** Étape en cours, de 1 à 3. */
  current: RegisterStep;
}

export function AuthStepper({ current }: AuthStepperProps) {
  const total = REGISTER_STEPS.length;

  return (
    // Segments et libellé sur UNE ligne. Le libellé occupait auparavant sa propre ligne, ce qui
    // coûtait dix-huit pixels — précisément ceux qui manquaient à l'inscription pour tenir sans
    // défilement une fois la vérification humaine ajoutée.
    <div className="mb-4 flex items-center gap-3">
      <div
        className="auth-steps flex-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`Étape ${current} sur ${total} : ${REGISTER_STEPS[current - 1]}`}
      >
        {REGISTER_STEPS.map((label, index) => {
          const position = index + 1;
          const state =
            position < current ? "done" : position === current ? "current" : "todo";
          return <span key={label} className="auth-step-seg" data-state={state} />;
        })}
      </div>

      <p
        className="shrink-0 text-[11px] font-medium whitespace-nowrap"
        style={{ color: "var(--label-tertiary)" }}
      >
        Étape {current} sur {total} · {REGISTER_STEPS[current - 1]}
      </p>
    </div>
  );
}
