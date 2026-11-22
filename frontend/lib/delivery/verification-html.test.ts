import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import { verificationPage, type DossierFile } from "./verification"
import { embedJson, escapeHtml, verificationHtml } from "./verification-html"
import { verificationSections } from "./verification-words"

/** La page exportée avec son dossier (R212) : un fichier qui se lit seul, et qui porte le dossier tel quel. */
const example = (): DossierFile =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../../contracts/evidence/example-mission.json"), "utf8")) as DossierFile
const t = CONSTANTS_EN.verification

describe("la page exportée avec son dossier", () => {
  const file = example()
  const sections = verificationSections(verificationPage(file), t)
  const html = verificationHtml({ title: "Verification: WEB-48", heading: "Verification: WEB-48", notes: [t.audience, t.assembled] },
    sections, JSON.stringify(file, null, 2))

  it("les mêmes rubriques que l'écran, et à qui la page s'adresse", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true)
    for (const section of sections) expect(html).toContain(`<section id="${section.id}"><h2>${escapeHtml(section.title)}</h2>`)
    expect(html).toContain(escapeHtml(t.audience))
    expect(html).toContain("<pre class=\"agent\">")
    expect(html).toContain("<a href=\"https://github.com/acme/website/pull/212\">")
  })

  it("le dossier y est tel qu'exporté : on le relit, et il se vérifie comme le fichier", () => {
    const embedded = /<script type="application\/json" id="taskforce-evidence">([\s\S]*)<\/script>/.exec(html)?.[1] ?? ""
    expect(JSON.parse(embedded)).toEqual(file)
  })

  it("rien de ce que le dossier porte ne devient du code dans la page", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;")
    const json = JSON.stringify({ text: "</script><script>alert(1)</script> " })
    const embedded = embedJson(json)
    expect(embedded).not.toContain("</script>")
    expect(JSON.parse(embedded)).toEqual(JSON.parse(json))
    const hostile = verificationHtml({ title: "<b>", heading: "<b>", notes: [] },
      [{ id: "request", title: "<i>", lines: [{ text: "<script>x</script>", body: "</pre><script>y</script>" }] }], json)
    expect(hostile).not.toMatch(/<script>[xy]/)
    expect(hostile.match(/<script/g)).toHaveLength(1)
  })
})
