import { describe, expect, it } from "vitest"

import { addressOf, isBareHome, placeOf, placeToRestore } from "./last-place"

/** La fenêtre s'ouvre là où la personne l'a laissée (R123) : l'adresse retenue, rouverte sur l'accueil nu. */
describe("last place", () => {
  it("l'adresse de la fenêtre : le chemin et sa requête", () => {
    expect(addressOf("/acme/projects/3", "issue=12&c=4")).toBe("/acme/projects/3?issue=12&c=4")
    expect(addressOf("/acme/projects/3", new URLSearchParams("c=4"))).toBe("/acme/projects/3?c=4")
    expect(addressOf("/acme", "?c=4")).toBe("/acme?c=4")
    expect(addressOf("/acme", null)).toBe("/acme")
  })

  it("l'accueil nu : ni volet, ni rien dans la requête", () => {
    expect(isBareHome("/acme", "", "acme")).toBe(true)
    expect(isBareHome("/acme", "c=4", "acme")).toBe(false)
    expect(isBareHome("/acme/dashboard", "", "acme")).toBe(false)
    expect(isBareHome("/acme", "", "")).toBe(false)
  })

  it("se retient : une adresse de l'espace, hors des réglages", () => {
    expect(placeOf("/acme/projects/3", "issue=12&c=4", "acme")).toBe("/acme/projects/3?issue=12&c=4")
    expect(placeOf("/acme", "", "acme")).toBe("/acme")
    expect(placeOf("/acme/settings", "", "acme")).toBeNull()
    expect(placeOf("/other/projects/3", "", "acme")).toBeNull()
    expect(placeOf("/acmex/projects/3", "", "acme")).toBeNull()
    expect(placeOf(null, "", "acme")).toBeNull()
  })

  it("se rouvre : sur l'accueil nu, l'endroit retenu de cet espace, quand il en diffère", () => {
    expect(placeToRestore("/acme", "", "acme", "/acme/projects/3?c=4")).toBe("/acme/projects/3?c=4")
    expect(placeToRestore("/acme", "", "acme", "/acme?c=4")).toBe("/acme?c=4")
    // Un lien qui ouvre la fenêtre ailleurs l'emporte ; l'accueil nu retenu n'a rien à rouvrir.
    expect(placeToRestore("/acme/projects/3", "", "acme", "/acme/roadmap")).toBeNull()
    expect(placeToRestore("/acme", "c=9", "acme", "/acme/roadmap")).toBeNull()
    expect(placeToRestore("/acme", "", "acme", "/acme")).toBeNull()
    expect(placeToRestore("/acme", "", "acme", undefined)).toBeNull()
    // L'adresse d'un autre espace ne se rouvre pas ici, même quand son nom commence pareil.
    expect(placeToRestore("/acme", "", "acme", "/acmex/roadmap")).toBeNull()
  })
})
