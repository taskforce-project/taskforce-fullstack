import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthStepper, REGISTER_STEPS } from "./auth-stepper";

// Le stepper lit désormais les libellés depuis le store i18n : on fournit les constantes FR réelles
// (importActual évite le hoisting de vi.mock) pour que « Compte »/« Vérification » et l'aria restent
// en français dans ce test.
vi.mock("@/lib/store/preferences-store", async () => {
  const { CONSTANTS_FR } = await vi.importActual<typeof import("@/lib/constants_fr")>("@/lib/constants_fr");
  return {
    usePreferencesStore: () => ({ t: CONSTANTS_FR }),
  };
});

/**
 * Le fil d'étapes est unique et porté par les pages d'inscription. Chaque étape porte un libellé
 * d'un mot, toujours visible (le parcours entier est lisible d'entrée).
 */
describe("AuthStepper", () => {
  it("affiche le libellé d'un mot de chacune des deux étapes", () => {
    render(<AuthStepper current={1} />);
    expect(screen.getByText("Compte")).toBeInTheDocument();
    expect(screen.getByText("Vérification")).toBeInTheDocument();
  });

  it("expose la progression aux technologies d'assistance", () => {
    render(<AuthStepper current={2} />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "2");
    expect(bar).toHaveAttribute("aria-valuetext", "Étape 2 sur 2 : Vérification");
  });

  it("marque l'étape franchie, l'étape courante et celles à venir", () => {
    const { container } = render(<AuthStepper current={2} />);
    const segments = container.querySelectorAll(".auth-step-seg");

    expect(segments).toHaveLength(REGISTER_STEPS.length);
    expect(segments[0]).toHaveAttribute("data-state", "done");
    expect(segments[1]).toHaveAttribute("data-state", "current");
  });

  it("à la première étape, aucune n'est encore franchie", () => {
    const { container } = render(<AuthStepper current={1} />);
    const segments = container.querySelectorAll(".auth-step-seg");

    expect(segments[0]).toHaveAttribute("data-state", "current");
    expect([...segments].filter((s) => s.getAttribute("data-state") === "done")).toHaveLength(0);
  });
});
