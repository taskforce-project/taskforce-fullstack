import { describe, expect, it } from "vitest"

import { brokenChain, example, exampleKey, olderFailed, running, tamperedTitle } from "./__tests__/records"
import { checkRecord } from "./verification-check"

/**
 * La page vérifie le dossier avant d'en rien dire (R161 B1, R159 P5), avec le vérificateur du runner partagé
 * (`lib/evidence`) : la chaîne, l'en-tête, les textes, et le sceau, comparé aux clés de l'instance.
 */
const at = () => new Date("2026-11-24T09:00:00.000Z")

describe("checkRecord", () => {
  it("l'exemple tient : la chaîne, l'en-tête, chaque texte ; scellé par une clé que l'instance ne dit pas sienne", async () => {
    const check = await checkRecord(example(), [`sha256:${"0".repeat(64)}`], at)

    expect(check).toMatchObject({ at: "2026-11-24T09:00:00.000Z", chain: "holds", brokenAt: null, keysKnown: true })
    expect(check.details?.header.differs).toEqual([])
    expect(check.details?.texts.changed).toEqual([])
    expect(check.details?.texts.matches.length).toBeGreaterThan(0)
    expect(check.details?.seal.state).toBe("self")
  })

  it("scellé par une clé de l'instance : de confiance", async () => {
    const check = await checkRecord(example(), [exampleKey()], at)

    expect(check.details?.seal).toMatchObject({ state: "trusted", custody: "same-machine", kept: false })
  })

  it("sans les clés de l'instance, la page le sait", async () => {
    const check = await checkRecord(example(), null, at)

    expect(check.keysKnown).toBe(false)
    expect(check.details?.seal.state).toBe("self")
  })

  it("une chaîne cassée dit l'événement où elle casse, et rien d'autre ne se lit", async () => {
    const { file, at: seq } = brokenChain()

    const check = await checkRecord(file, [], at)

    expect(check).toMatchObject({ chain: "link", brokenAt: seq, details: null })
  })

  it("un texte changé se dit par son empreinte", async () => {
    const { file, hash } = tamperedTitle()

    const check = await checkRecord(file, [], at)

    expect(check.chain).toBe("holds")
    expect(check.details?.texts.changed).toEqual([hash])
  })

  it("des événements retirés à la fin, un fichier qui n'est pas un dossier", async () => {
    const cut = example()
    cut.events.pop()
    expect((await checkRecord(cut, [], at)).chain).toBe("root")
    expect((await checkRecord({ format: "other", events: [], root: "" }, [], at)).chain).toBe("format")
  })

  it("une mission en cours et une mission d'avant la 1.18 tiennent, sans sceau", async () => {
    expect((await checkRecord(running(), [], at)).details?.seal.state).toBe("none")
    const older = await checkRecord(olderFailed(), [], at)
    expect(older.chain).toBe("holds")
    expect(older.details?.header.covered).not.toContain("workspace")
  })
})
