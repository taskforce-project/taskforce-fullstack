"use client";

import { RegisterPlanForm } from "@/components/auth/register/plan/plan-form";
import { AuthStepper } from "@/components/auth/auth-stepper";

/**
 * Étape 2 sur 3 — choix de la formule.
 *
 * Seule page d'authentification à réclamer de la largeur : les formules se comparent côte à côte,
 * les empiler supprimerait la comparaison, qui est tout l'intérêt de l'écran. Le centrage vertical
 * et la coquille viennent du layout.
 */
export default function RegisterPlanPage() {
  return (
    <div className="w-full max-w-5xl py-6">
      <div className="mx-auto max-w-md">
        <AuthStepper current={2} />
      </div>
      <RegisterPlanForm />
    </div>
  );
}
