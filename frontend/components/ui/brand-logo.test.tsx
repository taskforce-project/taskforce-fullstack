import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { BrandLogo, NAME_ONLY } from "./brand-logo";
import { BRAND_LOGOS } from "@/lib/brand-logos.generated";

describe("BrandLogo", () => {
  it.each([
    // [slug, nom affiché, initiales attendues]
    ["anthropic", "Claude Code", "CL"],
    ["anthropic", "Claude (API)", "CL"],
    ["marque-inconnue", "Acme", "AC"],
  ])("« %s » (%s) : repli neutre en initiales, aucun fichier de logo chargé", (slug, name, expected) => {
    const { container } = render(<BrandLogo slug={slug} name={name} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(expected);
  });

  it("le logo d'Anthropic reste vendorisé, mais n'est jamais affiché (conditions d'Anthropic, ADR-013)", () => {
    expect(BRAND_LOGOS["anthropic"]).toBeDefined();
    expect(NAME_ONLY.has("anthropic")).toBe(true);
  });

  it("une marque vendorisée hors NAME_ONLY garde son logo", () => {
    const { container } = render(<BrandLogo slug="cursor" name="Cursor" />);

    expect(BRAND_LOGOS["cursor"]).toBeDefined();
    expect(container.querySelector("img")).not.toBeNull();
  });
});
