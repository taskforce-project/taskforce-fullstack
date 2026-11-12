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

  it("une marque vendorisée en deux variantes garde son logo clair et sombre", () => {
    const { container } = render(<BrandLogo slug="github" name="GitHub" />);

    expect(BRAND_LOGOS["github"]).toBe("themed");
    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toEqual(["/logos/github-light.svg", "/logos/github-dark.svg"]);
  });

  it.each([
    // [clé, nom affiché] : des marques absentes de SVGL, venues de Simple Icons, d'une seule couleur
    ["plane", "Plane"],
    ["hubspot", "HubSpot"],
  ])("« %s » vient de Simple Icons : un masque peint de la couleur du texte, lisible dans les deux thèmes", (slug, name) => {
    render(<BrandLogo slug={slug} name={name} />);

    expect(BRAND_LOGOS[slug]).toBe("mono");
    const logo = screen.getByRole("img", { name });
    expect(logo.tagName).toBe("SPAN");
    expect(logo.getAttribute("style")).toContain(`/logos/${slug}.svg`);
  });
});
