import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { BrandLogo } from "./brand-logo";
import { BRAND_LOGOS } from "@/lib/brand-logos.generated";

describe("BrandLogo", () => {
  it("« marque-inconnue » : repli neutre en initiales, aucun fichier de logo chargé", () => {
    const { container } = render(<BrandLogo slug="marque-inconnue" name="Acme" />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("AC");
  });

  it.each([
    // [clé, nom affiché]
    ["anthropic", "Claude Code"],
    ["anthropic", "Claude"],
  ])("« %s » (%s) montre la marque de Claude (R144, décision du CEO)", (slug, name) => {
    render(<BrandLogo slug={slug} name={name} />);

    expect(screen.getByRole("img", { name })).toHaveAttribute("src", "/logos/anthropic.svg");
  });

  it("le fichier de la marque de Claude est au manifeste", () => {
    expect(BRAND_LOGOS["anthropic"]).toBe("single");
  });

  it("une marque vendorisée garde son logo", () => {
    const { container } = render(<BrandLogo slug="cursor" name="Cursor" />);

    expect(BRAND_LOGOS["cursor"]).toBeDefined();
    expect(container.querySelector("img")).not.toBeNull();
  });
});
