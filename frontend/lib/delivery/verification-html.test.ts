import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import { brokenChain, example, exampleKey } from "./__tests__/records"
import { verificationPage } from "./verification"
import { checkRecord } from "./verification-check"
import { CONTENT_SECURITY_POLICY, embedJson, escapeHtml, verificationHtml, type ExportHead } from "./verification-html"
import { alertLines, FOLD, pageTitle, summarySentence, verdictLines, verificationSections, type Section } from "./verification-words"

/**
 * La page exportée avec son dossier (R212) : un fichier qui se lit seul, sans code (R159 P6), qui dit en tête ce qui a été
 * vérifié à l'export, par quelle instance et quand, et qu'il ne prouve rien par lui-même (R161 B1, F5), et qui porte le
 * dossier tel quel (R161 M6).
 */
const t = CONSTANTS_EN.verification
const at = () => new Date("2026-11-24T09:00:00.000Z")

async function exported() {
  const file = example()
  const page = verificationPage(file, await checkRecord(file, [exampleKey()], at))
  const sections = verificationSections(page, t, { runId: 42, desktop: false })
  const head: ExportHead = {
    title: pageTitle(page, t),
    assembled: "Assembled by TaskForce 1.18.0 (app.example.com) on 2026-11-24 09:00 UTC, from the record of mission 42 of the workspace acme.",
    verdict: verdictLines(page, t),
    proves: t.export.proves,
    sentence: summarySentence(page, t),
    notes: [t.audience, t.assembled, t.scope],
    howTo: t.export.howTo.replaceAll("{id}", "42").replace("{key}", ""),
    moreFiles: t.showAllFiles,
  }
  return { file, page, sections, head, html: verificationHtml(head, sections, JSON.stringify(file, null, 2)) }
}

const line = (text: string) => ({ text })

describe("la page exportée avec son dossier", () => {
  it("R159 P6 : aucun code ; le seul bloc de script est le dossier, en données", async () => {
    const { html } = await exported()
    expect(CONTENT_SECURITY_POLICY).toBe("default-src 'none'; style-src 'unsafe-inline'")
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`)
    expect(html.match(/<script/g)).toEqual(["<script"])
    expect(html).toContain("<script type=\"application/json\" id=\"taskforce-evidence\">")
    expect(html).not.toMatch(/ on[a-z]+=|javascript:/i)
  })

  it("R161 B1 et F5 : en tête, le titre de la demande, ce qui a été vérifié, par quelle instance et quand, et ce que le fichier ne prouve pas", async () => {
    const { html, head } = await exported()
    expect(html).toContain("<title>Verification of WEB-48: Fix the footer links</title>")
    expect(html).toContain("<h1>Verification of WEB-48: Fix the footer links</h1>")
    expect(html).toContain(escapeHtml(head.assembled))
    expect(html).toContain(escapeHtml(head.verdict[0]?.text ?? "?"))
    expect(html).toMatch(/Checked in this app on 2026-11-24 09:00 UTC: every digest of the chain holds/)
    expect(html).toContain(`<p class="warn">${escapeHtml(t.export.proves)}</p>`)
    expect(html.indexOf(escapeHtml(t.export.proves))).toBeLessThan(html.indexOf("<main>"))
    expect(html).toContain("<main>")
    expect(html).toContain("</main>")
  })

  it("les mêmes rubriques que l'écran, dépliables, et les liens vers GitHub seulement", async () => {
    const { html, sections } = await exported()
    for (const section of sections) {
      expect(html).toContain(`<details class="section" id="${section.id}" open><summary><h2>${escapeHtml(section.title)}</h2></summary>`)
    }
    expect(html).toContain("<a href=\"https://github.com/acme/website/pull/212\">https://github.com/acme/website/pull/212</a>")
    expect(html).toContain("<div class=\"agent\" data-agent=\"true\"><h3>What I did</h3>")
    expect(html).toContain("<code>src/components/footer.tsx</code>")
    expect(html).toContain("<details><summary class=\"muted\">The brief given to the agent")
    expect(html).toContain("overflow-wrap:anywhere")
  })

  it("R161 M6 : la consigne dit où est le dossier dans ce fichier, et la commande exacte", async () => {
    const { html } = await exported()
    expect(html).toContain(escapeHtml("save what lies between <script type=\"application/json\" id=\"taskforce-evidence\"> and </script> as evidence-run-42.json"))
    expect(html).toContain("npm run verify -- evidence-run-42.json")
    expect(html).not.toMatch(/evidence-run-N|\{id\}|\{key\}/)
  })

  it("le dossier y est tel qu'exporté : on le relit, et il se vérifie comme le fichier", async () => {
    const { html, file } = await exported()
    const embedded = /<script type="application\/json" id="taskforce-evidence">([\s\S]*)<\/script>/.exec(html)?.[1] ?? ""
    expect(JSON.parse(embedded)).toEqual(file)
    expect((await checkRecord(JSON.parse(embedded), [exampleKey()], at)).chain).toBe("holds")
  })

  it("R161 N1 : un dossier changé a son alerte dans la page exportée aussi, et la phrase vient après « What the changed record says: »", async () => {
    const file = brokenChain().file
    const page = verificationPage(file, await checkRecord(file, [exampleKey()], at))
    const verdict = verdictLines(page, t)
    const html = verificationHtml({ title: "x", assembled: "", verdict: verdict.filter((l) => !l.alert),
      alert: { title: t.changedRecord.title, lines: alertLines(verdict), says: t.changedRecord.says }, proves: "p", sentence: "THE SENTENCE",
      notes: [], howTo: "", moreFiles: t.showAllFiles }, [], null)
    expect(html).toMatch(new RegExp(`<div class="alert" role="alert"><p><strong>${t.changedRecord.title}</strong></p><p>[^<]*Its chain breaks at event \\d+`))
    expect(html.indexOf(t.changedRecord.says)).toBeLessThan(html.indexOf("THE SENTENCE"))
    const { html: sound } = await exported()
    expect(sound).not.toContain("class=\"alert\"")
    expect(sound).not.toContain(t.changedRecord.says)
  })

  it("N4 du second tour de #551 : la page exportée d'un dossier d'avant la 1.18 ne porte pas ce dossier, ni ses courriels", () => {
    const html = verificationHtml({ title: "x", assembled: "", verdict: [], proves: "", sentence: "", notes: [],
      howTo: t.export.howToLegacy.replace("{id}", "3"), moreFiles: t.showAllFiles }, [], null)
    expect(html).not.toContain("<script")
    expect(html).toContain(escapeHtml("this file does not carry it. An owner or admin of the workspace can download it as JSON"))
  })

  it("R161 M1 : une longue liste se replie avec son nombre", () => {
    const files = Array.from({ length: FOLD + 2 }, (_, i) => line(`file-${i}.ts`))
    const sections: Section[] = [{ id: "changed", title: "2. What changed", lines: [{ text: "12 files changed", list: { lines: files, fold: FOLD } }] }]
    const html = verificationHtml({ title: "x", assembled: "", verdict: [], proves: "", sentence: "", notes: [], howTo: "", moreFiles: t.showAllFiles },
      sections, "{}")
    expect(html).toContain("<p>file-9.ts</p><details><summary class=\"muted\">Show all 12 files</summary><p>file-10.ts</p><p>file-11.ts</p></details>")
  })

  it("R159 P7 : rien de ce que le dossier porte ne devient du code ni un lien ailleurs que GitHub", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;")
    const json = JSON.stringify({ text: "</script><script>alert(1)</script>   & <!--" })
    const embedded = embedJson(json)
    expect(embedded).not.toContain("</script>")
    expect(embedded).not.toContain("<!--")
    expect(JSON.parse(embedded)).toEqual(JSON.parse(json))
    const hostile = verificationHtml({ title: "<b>", assembled: "<i>", verdict: [{ text: "<u>", tone: "warn" }], proves: "<s>", sentence: "<q>",
      notes: ["<em>"], howTo: "<script>z</script>", moreFiles: "{count}" },
      [{ id: "request", title: "<i>", lines: [
        { text: "<script>x</script>", body: "</pre><script>y</script>" },
        { text: "Pull request: javascript:alert(1)", link: "javascript:alert(1)" },
        { text: "Look: https://evil.example/x", link: "https://evil.example/x" },
        { text: "Summary", tone: "agent", blocks: [{ kind: "paragraph", parts: [{ code: true, text: "<img src=x>" }] }] },
      ] }], json)
    expect(hostile).not.toMatch(/<script>[xyz]/)
    expect(hostile.match(/<script/g)).toHaveLength(1)
    expect(hostile).not.toContain("<a href")
    expect(hostile).toContain("<code>&lt;img src=x&gt;</code>")
  })
})
