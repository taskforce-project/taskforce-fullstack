import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import type { MissionEvidence, MissionEvidenceEvent } from "@/lib/api/delivery-service"
import { CONSTANTS_EN } from "@/lib/constants_en"

import { verificationPage, type DossierFile } from "./verification"
import { short, verificationSections, when } from "./verification-words"

/**
 * La page de vérification (R212), remplie depuis le dossier seul : l'exemple de contracts/evidence est l'export d'une
 * mission entière, écrit et scellé par le serveur. Rien d'autre n'entre dans la page.
 */
const EXAMPLE = path.resolve(__dirname, "../../../contracts/evidence/example-mission.json")
const example = (): DossierFile => JSON.parse(readFileSync(EXAMPLE, "utf8")) as DossierFile
const t = CONSTANTS_EN.verification

/** Un dossier minimal, écrit ici, pour ce que l'exemple ne montre pas. */
function dossier(events: Array<Partial<MissionEvidenceEvent> & { type: string; data: Record<string, unknown> }>,
                 extra: Partial<MissionEvidence> = {}): DossierFile {
  return {
    format: "taskforce-evidence/1",
    root: `sha256:${"0".repeat(64)}`,
    events: events.map((e, i) => ({ seq: i + 1, at: "2026-11-22T08:00:00.000Z", actor: { kind: "server", id: "taskforce" },
      prev: "", hash: `sha256:${String(i).padStart(64, "0")}`, ...e })),
    ...extra,
  }
}

describe("la page, depuis l'exemple d'une mission entière", () => {
  const page = verificationPage(example())

  it("1. la demande : le titre et la description pris à côté de la chaîne, qui l'a écrite, qui l'a confiée, qui en répond", () => {
    expect(page.request.known).toBe(true)
    expect(page.request.issue).toBe("WEB-48")
    expect(page.request.title).toEqual({ state: "text", text: "Fix the footer links" })
    expect(page.request.description.state).toBe("text")
    expect(page.request.writtenBy).toBe("grace@example.com")
    expect(page.request.delegatedBy).toBe("ada@example.com")
    expect(page.request.accountable).toBe("ada@example.com")
    expect(page.request.origin).toBe("app")
    expect(page.request.brief?.text.state).toBe("text")
    expect(page.request.brief?.sha256).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it("2. ce qui a changé : le résumé de l'agent, les fichiers, et l'écriture jugée qui a laissé chaque contenu", () => {
    expect(page.changes.status).toBe("DONE")
    expect(page.changes.summary.state).toBe("text")
    expect(page.changes.files).toHaveLength(1)
    expect(page.changes.files[0]?.path).toBe("src/components/footer.tsx")
    expect(page.changes.files[0]?.writtenAt).toBeGreaterThan(0)
    expect(page.changes.pullRequest).toBe("https://github.com/acme/website/pull/212")
    expect(page.changes.head).toMatch(/^[0-9a-f]{40}$/)
  })

  it("3. la classe : la plus lourde des actions faites, la règle qui l'a donnée, sa version, qui l'a écrite", () => {
    expect(page.classOf.class).toBe("irreversible")
    expect(page.classOf.rule?.id).toBe("search-web")
    expect(page.classOf.rule?.author).toBe("TaskForce")
    expect(page.classOf.rule?.owner).toBe("ada@example.com")
    expect(page.classOf.rulesKnown).toBe(true)
    expect(page.classOf.judged).toBeGreaterThan(0)
    expect(page.classOf.asked).toBe(1)
  })

  it("4 et 5. les vérifications, et ce qui ne l'a pas été : le runner a testé, l'agent a déclaré, une ligne reste ouverte", () => {
    const tests = page.checks.find((c) => c.what === "tests")
    expect(tests).toMatchObject({ result: "passed", by: "runner", passedCount: 48, total: 48 })
    expect(tests?.proof).toMatch(/^sha256:/)
    expect(page.checks.find((c) => c.what === "checklist")?.by).toBe("declared")
    const kinds = page.notChecked.map((n) => n.kind)
    expect(kinds).toEqual(expect.arrayContaining(["declaredByAgent", "openItems", "summary", "noReviewer", "ciNotRead"]))
  })

  it("6. les décisions : l'accord sur l'action exacte, avec sa raison, puis la décision de fin, qui, où", () => {
    const approval = page.decisions.find((d) => d.kind === "approval")
    expect(approval).toMatchObject({ decision: "ALLOWED", who: "ada@example.com", rule: "search-web", scope: "ONCE" })
    expect(approval?.input).toMatch(/^sha256:/)
    expect(approval?.reason).toContain("public docs site")
    expect(page.end).toMatchObject({ decision: "APPLY", who: "ada@example.com", where: "taskforce" })
  })

  it("7. le modèle : celui qui a réellement tourné, sa version, chez qui", () => {
    expect(page.model).toMatchObject({ known: true, agent: "claude-code", agentVersion: "2.1.300", chosen: "sonnet",
      model: "claude-sonnet-5-20261001", provider: "anthropic", local: false, fingerprint: null })
    expect(page.model.session?.sha256).toMatch(/^sha256:/)
  })

  it("le dossier lui-même : son sceau, la garde de sa clé, son témoin, son trou", () => {
    expect(page.record.headerFromChain).toBe(true)
    expect(page.record.seal).toMatchObject({ custody: "same-machine", kept: false, coversAll: true })
    expect(page.record.witness).toMatchObject({ written: true })
    expect(page.record.gaps).toEqual([{ from: 9, to: 9 }])
  })

  it("les mots : sept rubriques et le dossier, dans l'ordre de R212 ; le résumé seul est de l'agent ; jamais « conforme »", () => {
    const sections = verificationSections(page, t)
    expect(sections.map((s) => s.id)).toEqual(["request", "changed", "classification", "checks", "notChecked", "decisions", "model", "record"])
    const agent = sections.flatMap((s) => s.lines).filter((l) => l.tone === "agent")
    expect(agent).toHaveLength(1)
    expect(agent[0]?.text).toBe(t.changed.summary)
    const words = JSON.stringify(sections) + JSON.stringify(t)
    expect(words).not.toMatch(/complian|complies|conforme/i)
    expect(sections.find((s) => s.id === "record")?.lines.map((l) => l.text).join(" ")).toContain("same machine as the agent")
    const changed = sections.find((s) => s.id === "changed")?.lines.map((l) => l.text) ?? []
    expect(changed.find((l) => l.startsWith("Branch "))).toMatch(/, 1 commit, last commit /)
  })
})

describe("une rubrique que le dossier ne sait pas remplir le dit", () => {
  it("un dossier d'avant la 1.18 : ni la demande, ni le modèle, ni le sceau, ni les règles", () => {
    const page = verificationPage(dossier([
      { type: "mission.started", data: { issue: "WEB-12", requestedBy: "ada@example.com", agent: { kind: "claude-code", model: null },
        rules: { version: 1, digest: `sha256:${"a".repeat(64)}` } } },
      { type: "mission.ended", data: { status: "FAILED", error: "Runner lost" } },
    ]))
    const sections = verificationSections(page, t)
    const text = (id: string) => sections.find((s) => s.id === id)?.lines.map((l) => l.text) ?? []
    expect(page.request.known).toBe(false)
    expect(text("request")).toContain(t.unknown)
    expect(text("changed")).toContain(t.changed.notTracked)
    expect(text("classification")).toEqual(expect.arrayContaining([t.classification.noDecision, t.classification.noRules]))
    expect(text("checks")).toEqual([t.checks.none])
    expect(text("model")).toContain(t.model.unknown)
    expect(text("record")).toEqual(expect.arrayContaining([t.record.older, t.record.notSealed, t.record.noPullRequest]))
    expect(text("decisions")).toEqual(expect.arrayContaining([t.decisions.none, t.decisions.undecided]))
  })

  it("aucun test configuré, un texte effacé, un témoin qui manque, une demande échue", () => {
    const erasedHash = `sha256:${"e".repeat(64)}`
    const page = verificationPage(dossier([
      { type: "mission.started", data: { mission: 7, workspace: "acme", request: { title: { sha256: erasedHash, chars: 5 } },
        origin: { channel: "retry", run: 6 } } },
      { type: "action.decided", actor: { kind: "server", id: "taskforce" }, data: { approval: 3, effect: "ask", summary: "npm install", rule: "x" } },
      { type: "action.decided", actor: { kind: "server", id: "taskforce" }, data: { approval: 3, effect: "deny", reason: "No answer in time." } },
      { type: "test.result", actor: { kind: "runner", id: "r" }, data: { kind: "test", configured: false, ran: false } },
      { type: "mission.ended", data: { status: "DONE", commits: 2, resultUrl: "https://github.com/acme/website/pull/9" } },
      { type: "note", data: { kind: "witness", written: false, reason: "Connect GitHub" } },
      { type: "human.decision", actor: { kind: "person", id: "ada@example.com" }, data: { kind: "erased", text: erasedHash, what: "title" } },
    ]))
    expect(page.request.title).toEqual({ state: "erased" })
    expect(page.request.origin).toBe("retry")
    expect(page.notChecked.map((n) => n.kind)).toEqual(expect.arrayContaining(["noTests", "noReviewer", "ciNotRead"]))
    expect(page.decisions.map((d) => d.kind)).toEqual(["expired", "erased"])
    expect(page.record.witness).toMatchObject({ written: false, reason: "Connect GitHub" })
    const lines = verificationSections(page, t).flatMap((s) => s.lines.map((l) => l.text))
    expect(lines).toEqual(expect.arrayContaining([t.erased, t.notChecked.noTests, "No witness: Connect GitHub",
      "Tried again from mission 6."]))
  })

  it("des tests qui échouent, puis un fichier remis : la vérification dit qu'elle porte sur une autre version", () => {
    const page = verificationPage(dossier([
      { type: "mission.started", data: {} },
      { type: "test.result", actor: { kind: "runner", id: "r" }, data: { kind: "test", command: "npm test", ran: true, passed: false } },
      { type: "action.result", actor: { kind: "runner", id: "r" }, data: { kind: "revert", ok: true, path: "a.ts" } },
      { type: "mission.ended", data: { status: "DONE", commits: 1 } },
    ]))
    expect(page.checks[0]).toMatchObject({ what: "tests", result: "failed" })
    expect(page.notChecked.map((n) => n.kind)).toEqual(expect.arrayContaining(["testsFailed", "testsStale"]))
  })

  it("aucun changement de code : rien à tester", () => {
    const page = verificationPage(dossier([{ type: "mission.started", data: {} }, { type: "mission.ended", data: { status: "DONE", commits: 0 } }]))
    expect(page.notChecked.map((n) => n.kind)).toContain("noCode")
  })

  it("des dates et des empreintes lisibles", () => {
    expect(when("2026-11-22T08:00:00.000Z")).toBe("2026-11-22 08:00 UTC")
    expect(when(null)).toBe("?")
    expect(when("not a date")).toBe("not a date")
    expect(short(`sha256:${"a".repeat(64)}`)).toBe("sha256:aaaaaaaaaaaa...")
    expect(short(null)).toBe("?")
  })
})
