import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthStepper, REGISTER_STEPS } from "./auth-stepper";

/**
 * Le fil d'étapes vivait auparavant, dupliqué, dans les trois formulaires d'inscription — chacun
 * avec sa propre barre de progression et son propre pourcentage en dur. Il est désormais unique et
 * porté par les pages. Ces tests reprennent la couverture qui était éparpillée dans
 * `plan-form.test.tsx` et `verification-form.test.tsx`.
 */
describe("AuthStepper", () => {
  it.each([
    [1, "Votre compte"],
    [2, "Votre formule"],
    [3, "Vérification"],
  ] as const)("étape %i : annonce sa position et son libellé", (current, label) => {
    render(<AuthStepper current={current} />);

    expect(screen.getByText(new RegExp(`étape ${current} sur 3`, "i"))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(label, "i"))).toBeInTheDocument();
  });

  it("expose la progression aux technologies d'assistance", () => {
    render(<AuthStepper current={2} />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(bar).toHaveAttribute("aria-valuetext", "Étape 2 sur 3 : Votre formule");
  });

  it("marque les étapes franchies, l'étape courante et celles à venir", () => {
    const { container } = render(<AuthStepper current={2} />);
    const segments = container.querySelectorAll(".auth-step-seg");

    expect(segments).toHaveLength(REGISTER_STEPS.length);
    expect(segments[0]).toHaveAttribute("data-state", "done");
    expect(segments[1]).toHaveAttribute("data-state", "current");
    expect(segments[2]).toHaveAttribute("data-state", "todo");
  });

  it("à la première étape, aucune n'est encore franchie", () => {
    const { container } = render(<AuthStepper current={1} />);
    const segments = container.querySelectorAll(".auth-step-seg");

    expect(segments[0]).toHaveAttribute("data-state", "current");
    expect([...segments].filter((s) => s.getAttribute("data-state") === "done")).toHaveLength(0);
  });
});
