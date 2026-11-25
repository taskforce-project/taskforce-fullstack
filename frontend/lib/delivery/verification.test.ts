import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import {
  brokenChain, chained, example, exampleKey, inheritedTicks, lateSealed, olderFailed, rechained, resealed, rewrittenResealed, running, tamperedTitle,
} from "./__tests__/records"
import { verificationPage } from "./verification"
import { checkRecord } from "./verification-check"
import {
  alertLines, exportHowTo, inlineParts, linkable, pageTitle, short, summaryBlocks, summarySentence, verdictLines, verificationSections, when,
  whoWords, type Section,
} from "./verification-words"

/**
 * La page de vérification (R212), remplie depuis le dossier seul, et vérifiée avant d'en rien dire : l'exemple de
 * contracts/evidence est l'export d'une mission entière, écrit et scellé par le serveur ; les dossiers d'état de la revue
 * des écrans (R161) en sont tirés. Chaque essai part d'une sonde ou d'une capture des relectures R159 et R161 de #552.
 */
const t = CONSTANTS_EN.verification
const context = { runId: 42, desktop: false }
const at = () => new Date("2026-11-24T09:00:00.000Z")
const texts = (sections: Section[], id: string) => sections.find((s) => s.id === id)?.lines.map((l) => l.text) ?? []
const all = (sections: Section[]) => sections.flatMap((s) => s.lines.flatMap((l) => [l.text, ...(l.list?.lines.map((x) => x.text) ?? [])]))

describe("la page, depuis l'exemple d'une mission entière", () => {
  const page = verificationPage(example())

  it("1. la demande : le titre pris à côté de la chaîne, les personnes par leur nom, jamais par leur identifiant", () => {
    expect(page.request.known).toBe(true)
    expect(page.request.issue).toBe("WEB-48")
    expect(page.request.title).toEqual({ state: "text", text: "Fix the footer links" })
    expect(page.request.writtenBy).toEqual({ kind: "named", name: "Grace" })
    expect(page.request.delegatedBy).toEqual({ kind: "named", name: "Ada" })
    expect(page.request.accountable).toEqual({ kind: "named", name: "Ada" })
    // Les personnes entrent au dossier par un identifiant `who:` (R159, second tour, L-e) : la page ne le montre jamais.
    expect(JSON.stringify(example().events)).toMatch(/who:[0-9a-f]{32}/)
    expect(JSON.stringify(verificationSections(page, t, context)) + summarySentence(page, t)).not.toMatch(/(who|person):[0-9a-f]{32}/)
  })

  it("2. ce qui a changé : les fichiers tels que l'agent les a nommés, et la décision qui a permis leur contenu", () => {
    expect(page.changes.files[0]?.path).toBe("src/components/footer.tsx")
    expect(page.changes.files[0]?.writtenAt).toBeGreaterThan(0)
    const changed = verificationSections(page, t, context).find((s) => s.id === "changed")
    expect(changed?.lines[0]?.text).toContain("as the agent wrote it")
    expect(changed?.lines[0]?.list?.lines[0]?.text).toMatch(/^“src\/components\/footer\.tsx” \(modified, \+3 −3\); its content is the one the rules allowed at event \d+$/)
  })

  it("3. R161 B2 : la classe du changement n'est pas celle d'une recherche web ; les règles de sa sortie sont nommées", () => {
    expect(page.classOf.exits.map((e) => e.rule.id)).toEqual(["push-agent-branch-private", "open-pull-request"])
    expect(page.classOf.heaviest?.rule.id).toBe("search-web")
    // La lecture, l'écriture et la recherche, puis les deux sorties : la demande posée par le serveur n'est pas un jugement de plus.
    expect(page.classOf.judged).toBe(page.classOf.exits.length + 3)
    const lines = texts(verificationSections(page, t, context), "classification")
    // R161 N2 du second tour de #552 : repliée, la rubrique dit d'abord sous quelles règles le changement est sorti, puis
    // l'avertissement de R210, sans « Below ».
    const [push, pr] = page.classOf.exits.map((e) => e.rule.reason ?? e.rule.id)
    expect(lines[0]).toBe(`Left the agent's copy under the rules “${push}” and “${pr}”: left the copy, and can be undone.`)
    expect(lines[1]).toBe(t.classification.notComputed)
    expect(t.classification.notComputed).not.toContain("Below")
    expect(lines.some((l) => l.startsWith("The branch was pushed under the rule"))).toBe(true)
    expect(lines.some((l) => l.startsWith("The pull request was opened under the rule"))).toBe(true)
    expect(lines.some((l) => l.startsWith("Heaviest action of the mission: WebSearch “docs.example.com footer links”"))).toBe(true)
    expect(lines.join(" ")).not.toMatch(/Class of the change/)
    // La copie du paquet nomme qui répond de la règle par son identifiant ; la page le dit par son nom (second tour, N3).
    expect(JSON.stringify(example().rules)).toMatch(/"owner":"who:[0-9a-f]{32}"/)
    expect(page.classOf.heaviest?.rule.owner).toEqual({ kind: "named", name: "Ada" })
    expect(lines).toContain("Answered for by Ada.")
  })

  it("4 et 5. R161 M9, R159 P3 : sous les vérifications, le runner et les règles seuls ; la coche de l'agent est une déclaration", () => {
    expect(page.checks.map((c) => c.what)).toEqual(["tests", "rules"])
    expect(page.checks[0]).toMatchObject({ result: "passed", by: "runner", passedCount: 48, total: 48 })
    expect(page.notChecked.map((n) => n.kind)).toEqual(expect.arrayContaining(["declaredByAgent", "openItems", "summary", "noReviewer", "ciNotRead"]))
    const sections = verificationSections(page, t, context)
    expect(all(sections).some((l) => l.startsWith("Checked off"))).toBe(false)
    expect(texts(sections, "checks")).toContain(t.checks.byRunner)
  })

  it("6. R161 F3 : un accord se lit avec son objet ; la règle par sa phrase, son identifiant ensuite", () => {
    const approval = page.decisions.find((d) => d.kind === "approval")
    expect(approval).toMatchObject({ decision: "ALLOWED", who: { kind: "named", name: "Ada" }, tool: "WebSearch", ruleId: "search-web", scope: "ONCE" })
    const lines = texts(verificationSections(page, t, context), "decisions")
    expect(lines[0]).toBe("Final decision: Applied by Ada.")
    expect(lines.some((l) => /^Ada allowed a web search for “docs\.example\.com footer links”, \d{4}-\d\d-\d\d \d\d:\d\d UTC, in TaskForce\.$/.test(l))).toBe(true)
    expect(lines.some((l) => /^Under the rule “.+” \(search-web\)\.$/.test(l))).toBe(true)
  })

  it("7. R159 P8, R161 F1 : le fournisseur et le modèle lus dans le dossier, en noms d'affichage", () => {
    expect(page.model).toMatchObject({ known: true, agent: "claude-code", agentVersion: "2.1.300", configured: "sonnet",
      model: "claude-sonnet-5-20261001", served: ["claude-sonnet-5-20261001"], provider: "anthropic" })
    const lines = texts(verificationSections(page, t, context), "model")
    expect(lines).toEqual(expect.arrayContaining(["Agent: Claude Code, version 2.1.300.", "Served by Anthropic."]))
    expect(lines.join(" ")).not.toMatch(/claude-code|not on this computer/)
  })

  it("le dossier : R161 M5, la garde de la clé avant le sceau ; R161 F2, une seule numérotation des événements", async () => {
    // Le témoin ne se montre comme tenant qu'une fois vérifié (R159 de #552, second tour, V1).
    const page = verificationPage(example(), await checkRecord(example(), [exampleKey()], at))
    const lines = texts(verificationSections(page, t, context), "record")
    const custody = lines.indexOf(t.record.custody["same-machine"])
    expect(custody).toBeGreaterThan(0)
    expect(lines[custody + 1]).toMatch(/^The seal covers the record up to event \d+/)
    expect(lines).toContain("The runner's event 9 never arrived (noted at event 15 of the record).")
    expect(lines.some((l) => /^Witness: the head of the record at event 23 \(sha256:[0-9a-f]{12}\), when it was sealed,/.test(l))).toBe(true)
    expect(lines).toContain("Events after 23, such as the final decision, came after the witness.")
    // Le témoin nomme la clé qui a scellé sa tête (second tour de #551, N6) : la page la donne entière, à comparer.
    expect(page.record.witness?.key).toBe(exampleKey())
    expect(lines).toContain(t.record.witnessKey.replace("{key}", exampleKey()))
    // R161 B4 : ce que le commentaire lie, ou pourquoi il ne lie pas la page (B2 et M1 de #551).
    expect(lines).toContain(t.record.pageLinked)
    const leftOut = (why: string) => {
      const witness = page.record.witness ? { ...page.record.witness, pageLinked: false, pageLeftOut: why } : null
      return texts(verificationSections({ ...page, record: { ...page.record, witness } }, t, context), "record")
    }
    expect(leftOut("desktop-app")).toContain(t.record.pageLeftOut["desktop-app"])
    expect(leftOut("public-repository")).toContain(t.record.pageLeftOut.repository)
    expect(leftOut("something-new")).toContain(t.record.pageLeftOut.other)
  })

  it("R161 M6 : la consigne nomme le bon fichier, et ne demande pas une clé que l'instance ne garde pas", async () => {
    // La clé du sceau tel que la page l'a vérifié (R159 de #552, second tour, V2).
    const page = verificationPage(example(), await checkRecord(example(), [exampleKey()], at))
    const lines = texts(verificationSections(page, t, context), "record")
    expect(lines).toContain("Download the record (JSON) below, then, in taskforce-runner: npm run verify -- evidence-run-42.json")
    expect(lines).toContain(t.record.verifyNoKeyMeans)
    const details = page.check?.details
    const kept = details ? { ...page, check: page.check ? { ...page.check, details: { ...details, seal: { ...details.seal, kept: true } } } : null } : page
    expect(texts(verificationSections(kept, t, context), "record").join(" ")).toMatch(/--key sha256:[0-9a-f]{64}/)
    expect(texts(verificationSections(kept, t, { runId: 42, desktop: true }), "record").join(" ")).not.toContain("--key")
    const noId = verificationPage(chained([{ type: "mission.started", data: {} }]))
    expect(texts(verificationSections(noId, t, { runId: 77, desktop: false }), "record").join(" ")).toContain("evidence-run-77.json")
  })

  it("les mots : sept rubriques puis le dossier, dans l'ordre de R212 ; seul le résumé est de l'agent ; jamais « conforme »", () => {
    const sections = verificationSections(page, t, context)
    expect(sections.map((s) => s.id)).toEqual(["request", "changed", "classification", "checks", "notChecked", "decisions", "model", "record"])
    const agent = sections.flatMap((s) => s.lines).filter((l) => l.tone === "agent")
    expect(agent).toHaveLength(1)
    expect(agent[0]?.blocks?.length).toBeGreaterThan(0)
    expect(JSON.stringify(sections) + JSON.stringify(t)).not.toMatch(/complian|complies|conforme/i)
    expect(pageTitle(page, t)).toBe("Verification of WEB-48: Fix the footer links")
  })

  it("R161 M1 : une phrase d'abord, assemblée par le code", () => {
    const decided = when(example().events.at(-1)?.at ?? null)
    expect(summarySentence(page, t)).toBe("Ada asked for “Fix the footer links”. 1 file changed, in a pull request. "
      + `The tests passed (48 of 48), run by TaskForce's runner on the agent's computer. Applied by Ada on ${decided}.`)
  })
})

describe("R161 B1, R159 P5 : la page dit ce qu'elle a vérifié, où et quand", () => {
  it("l'exemple tient : la première ligne le dit, la garde de la clé d'abord, et les faits du runner", async () => {
    const page = verificationPage(example(), await checkRecord(example(), [exampleKey()], at))
    const lines = verdictLines(page, t)
    expect(lines[0]?.text).toMatch(/^Checked in this app on 2026-11-24 09:00 UTC: every digest of the chain holds \(25 events\), the header comes from the chain, and the \d+ texts kept beside it match their digests\.$/)
    expect(lines.map((l) => l.text)).toEqual(expect.arrayContaining([t.verdict.trustedSameMachine, t.verdict.runnerFacts]))
    expect(lines.map((l) => l.text).join(" ")).not.toMatch(/intact|chained|Sealed at/)
  })

  it("avant la fin de la vérification, la page dit qu'elle vérifie", () => {
    expect(verdictLines(verificationPage(example()), t)).toEqual([{ text: t.checking, tone: "muted" }])
  })

  it("une chaîne cassée se dit en tête, avec l'événement où elle casse", async () => {
    const { file, at: seq } = brokenChain()
    const lines = verdictLines(verificationPage(file, await checkRecord(file, [], at)), t)
    expect(lines).toEqual([{ text: `Checked in this app on 2026-11-24 09:00 UTC: this record was changed after it was written. Its chain breaks at event ${seq}, so nothing below can be trusted.`, tone: "warn", alert: true }])
  })

  it("un texte changé se dit à sa place, et n'est pas montré comme la demande", async () => {
    const { file } = tamperedTitle()
    const page = verificationPage(file, await checkRecord(file, [], at))
    expect(page.request.title).toEqual({ state: "changed" })
    const sections = verificationSections(page, t, context)
    expect(texts(sections, "request")[0]).toBe("The request's title was changed after the record was written: it no longer matches its digest, so it is not shown.")
    expect(JSON.stringify(sections)).not.toContain("Fix the header links")
    expect(verdictLines(page, t).map((l) => l.text)).toContain(t.verdict.textsOne)
  })

  it("N5 du second tour de #551 : un sceau tardif tient, et la page dit qu'il ne prouve rien d'avant sa date", async () => {
    const { file, key } = lateSealed()
    const page = verificationPage(file, await checkRecord(file, [key], at))
    expect(page.record.seal?.late).toBe(true)
    const verdict = verdictLines(page, t).map((l) => l.text)
    expect(verdict).toContain(t.verdict.trustedSameMachine)
    expect(verdict).toContain("It was sealed late, on 2026-11-25 08:00 UTC, after its mission had ended: the seal proves the record as it was on that date, not what happened before.")
    expect(texts(verificationSections(page, t, context), "record")
      .some((l) => l.startsWith("The seal covers the record up to event 23, signed late, on 2026-11-25 08:00 UTC, with the key sha256:"))).toBe(true)
    // Un sceau posé à la fin de la mission ne parle pas de retard.
    const timely = verificationPage(example(), await checkRecord(example(), [exampleKey()], at))
    expect(JSON.stringify(verdictLines(timely, t)) + JSON.stringify(verificationSections(timely, t, context))).not.toMatch(/sealed late|signed late/i)
  })

  it("un sceau d'une clé que l'instance ne connaît pas, ou sans les clés de l'instance", async () => {
    const self = verdictLines(verificationPage(example(), await checkRecord(example(), [], at)), t).map((l) => l.text)
    expect(self).toContain(t.verdict.self)
    const unknown = verdictLines(verificationPage(example(), await checkRecord(example(), null, at)), t).map((l) => l.text)
    expect(unknown).toContain(t.verdict.selfNoKeys)
  })
})

describe("R161 B3, R159 P1 et P9 : les états ne disent que ce que le dossier montre", () => {
  it("une mission en cours dit qu'elle tourne ; ni « ran before TaskForce kept one », ni « nothing left unchecked »", async () => {
    const file = running()
    const page = verificationPage(file, await checkRecord(file, [], at))
    expect(page.running).toBe(true)
    const sections = verificationSections(page, t, context)
    expect(texts(sections, "changed")[0]).toBe(t.changed.noFilesYet)
    expect(texts(sections, "record")).toContain(t.record.noWitnessYet)
    expect(texts(sections, "notChecked")).toContain(t.notChecked.noTestYet)
    expect(all(sections)).not.toContain(t.notChecked.none)
    expect(all(sections).join(" ")).not.toMatch(/ran before TaskForce kept one/)
    expect(verdictLines(page, t).map((l) => l.text)).toContain(t.verdict.notSealedRunning)
    expect(summarySentence(page, t)).toContain(t.summary.working)
  })

  it("une mission d'avant la 1.18 finie en échec : finie avant le sceau, plus ancienne que ces faits, une seule phrase vraie", async () => {
    const file = olderFailed()
    const page = verificationPage(file, await checkRecord(file, [], at))
    expect(page.older).toBe(true)
    const sections = verificationSections(page, t, context)
    expect(verdictLines(page, t).map((l) => l.text)).toContain(t.verdict.notSealedEnded)
    expect(texts(sections, "model")[0]).toBe(t.older)
    expect(texts(sections, "request")).toContain(t.older)
    expect(texts(sections, "changed")[0]).toBe(t.changed.notTrackedOlder)
    expect(texts(sections, "checks")).toEqual([t.checks.none])
    expect(texts(sections, "notChecked")).not.toContain(t.notChecked.none)
    expect(texts(sections, "changed")).toContain("The mission did not finish. Its error, as it was reported: “Runner lost”")
    expect(all(sections).join(" ")).not.toMatch(/the agent did not report it|has not ended/)
  })

  it("N4 du second tour de #551 : un dossier d'avant la 1.18 ne montre aucun courriel, ni à l'écran ni dans la page exportée", async () => {
    const file = chained([
      { type: "mission.started", data: { issue: "WEB-12", requestedBy: "ada@example.com", agent: { kind: "claude-code", model: null } } },
      { type: "human.decision", actor: { kind: "person", id: "grace@example.com" }, data: { decision: "STOP", reason: "Asked by ada@example.com." } },
      { type: "mission.ended", data: { status: "FAILED", error: "Stopped by grace@example.com." } },
      { type: "note", at: "2026-11-24T08:00:00.000Z", data: { kind: "erased", legacy: true, events: [1, 2], reason: "account-deleted",
        text: "A person's account was deleted on 2026-11-24T08:00:00.000Z." } },
    ], { mission: { id: 3, workspace: "acme", issue: "WEB-12", requestedBy: "ada@example.com" } })
    const page = verificationPage(file, await checkRecord(file, [], at))
    expect(page.legacy).toBe(true)
    expect(page.request.delegatedBy).toEqual({ kind: "hidden" })
    const sections = verificationSections(page, t, context)
    const shown = JSON.stringify(sections) + summarySentence(page, t) + JSON.stringify(verdictLines(page, t)) + pageTitle(page, t)
    expect(shown).not.toMatch(/@example\.com/)
    expect(texts(sections, "request")).toContain(`Given to the agent by a person (email hidden) on ${when(file.events[0]?.at ?? null)}.`)
    expect(texts(sections, "changed")).toContain("The mission did not finish. Its error, as it was reported: “Stopped by (email hidden).”")
    expect(verdictLines(page, t).map((l) => l.text)).toContain(t.verdict.legacy)
    // La phrase d'abord prend sa majuscule, même quand elle commence par une personne masquée.
    expect(summarySentence(page, t)).toMatch(/^A person \(email hidden\) gave WEB-12 to the agent\./)
    expect(texts(sections, "record")).toContain("A person's account was deleted on 2026-11-24 08:00 UTC. Their email stays in events 1, 2, "
      + "written before TaskForce 1.18, which cannot change without breaking the chain: this page hides it.")
    // La page exportée ne porte pas ce dossier : seul un responsable de l'espace l'exporte en JSON.
    expect(exportHowTo(page, t, context)).toBe(t.export.howToLegacy.replace("{id}", "3"))
    // Le dossier d'aujourd'hui nomme ses personnes par un identifiant : rien n'y est masqué, et la page exportée le porte.
    const today = verificationPage(example())
    expect(today.legacy).toBe(false)
    expect(exportHowTo(today, t, context)).toBe(t.export.howTo.replaceAll("{id}", "42").replace("{key}", ""))
  })

  it("N2 du second tour de #551 : au plafond du dossier, TaskForce a arrêté la mission, et la page le dit dans ses mots", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", accountable: `who:${"1".repeat(32)}` } },
      { type: "limit.reached", data: { max: 10000, stopped: true, text: "The evidence of this mission reached its cap of 10000 events." } },
      { type: "mission.ended", data: { status: "FAILED", error: "Evidence cap reached: TaskForce stopped the mission." } },
    ]))
    expect(page.record.cap).toEqual({ seq: 2, max: 10000, stopped: true })
    const sections = verificationSections(page, t, context)
    expect(texts(sections, "changed")).toContain("TaskForce stopped the mission: its record reached 10,000 events, the most it keeps for one mission, "
      + "and the agent can't go on without a record. What the agent did in its last seconds, before the runner stopped it, may not have been written.")
    expect(texts(sections, "changed").join(" ")).not.toContain("Its error, as it was reported")
    expect(texts(sections, "record")).toContain("The record reached its cap of 10,000 events at event 2: later events were not kept, "
      + "except the end, the people's decisions and the witness.")
    expect(summarySentence(page, t)).toContain(t.summary.capped)
    // Une limite du runner (ses tours, sa durée) n'est pas le plafond du dossier.
    const turns = verificationPage(chained([{ type: "mission.started", data: { mission: 7, workspace: "acme" } },
      { type: "limit.reached", actor: { kind: "runner", id: "r" }, data: { kind: "limit", text: "Turn limit reached." } },
      { type: "mission.ended", data: { status: "FAILED", error: "Turn limit reached." } }]))
    expect(turns.record.cap).toBeNull()
  })

  it("R159 P3 : des coches héritées, que l'agent de cette mission n'a pas cochées, ne comptent pas pour elle", () => {
    const page = verificationPage(inheritedTicks())
    expect(page.checks.some((c) => c.what === "tests")).toBe(false)
    expect(page.notChecked).toEqual(expect.arrayContaining([{ kind: "doneUnattributed", items: ["#1", "#2"] }, { kind: "openItems", items: ["#3"] }]))
    expect(page.record.runnerFacts).toBe(true)
  })

  it("rien de vérifié : une seule phrase vraie", () => {
    const page = verificationPage(chained([{ type: "mission.started", data: { mission: 1, workspace: "acme" } },
      { type: "mission.ended", data: { status: "FAILED", error: "Stopped by the person who delegated it." } }]))
    expect(page.notChecked.map((n) => n.kind)).toEqual(["noTestRecord"])
    const sections = verificationSections(page, t, context)
    expect(texts(sections, "checks")).toEqual([t.checks.none])
    expect(texts(sections, "notChecked")).toEqual([t.notChecked.noTestRecord])
  })
})

describe("le reste du dossier, dit en clair", () => {
  it("R161 F7 : un texte effacé dit lequel, par qui et quand", () => {
    const erased = `sha256:${"e".repeat(64)}`
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", request: { title: { sha256: erased, chars: 5 } } } },
      { type: "note", data: { kind: "person", person: `who:${"1".repeat(32)}`, name: { sha256: `sha256:${"f".repeat(64)}`, chars: 3 } } },
      { type: "human.decision", at: "2026-11-23T10:00:00.000Z", actor: { kind: "person", id: `who:${"1".repeat(32)}` },
        data: { kind: "erased", text: erased, what: "title" } },
    ], { texts: { [`sha256:${"f".repeat(64)}`]: { salt: "0".repeat(32), text: "Ada" } } }))
    expect(page.request.title).toMatchObject({ state: "erased", erasure: { who: { kind: "named", name: "Ada" }, what: "title" } })
    expect(texts(verificationSections(page, t, context), "request")[0]).toBe("The request's title was erased by Ada on 2026-11-23 10:00 UTC: its digest stays in the record.")
  })

  it("une personne dont le compte a été purgé : ses textes sont effacés, la page ne montre pas son identifiant", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", requestedBy: `who:${"2".repeat(32)}` } },
      { type: "note", data: { kind: "person", person: `who:${"2".repeat(32)}`, email: { sha256: `sha256:${"d".repeat(64)}`, chars: 9 } } },
    ]))
    expect(page.request.delegatedBy).toEqual({ kind: "erased" })
    expect(whoWords(page.request.delegatedBy, t)).toBe(t.people.erased)
    expect(whoWords({ kind: "unnamed" }, t)).toBe(t.people.unnamed)
  })

  it("R210, second tour de #551 (N3) : la règle d'une personne dont le compte a été purgé dit quand son nom a été effacé", () => {
    const owner = `who:${"3".repeat(32)}`
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", rules: { version: 2, layers: [] } } },
      { type: "note", data: { kind: "person", person: owner, name: { sha256: `sha256:${"b".repeat(64)}`, chars: 3 } } },
      { type: "action.decided", actor: { kind: "rule", id: "push" }, data: { kind: "decision", effect: "allow", tool: "Bash", facts: [{ command: "git push" }] } },
      { type: "mission.ended", data: { status: "DONE" } },
      { type: "note", at: "2026-11-23T11:00:00.000Z", data: { kind: "erased", person: owner, texts: [`sha256:${"b".repeat(64)}`], reason: "account-deleted" } },
    ], { rules: { rules: [{ id: "push", class: "reversible-exit", owner, reason: "Push the agent's branch." }] } }))
    expect(page.classOf.heaviest?.rule.owner).toEqual({ kind: "erased", on: "2026-11-23T11:00:00.000Z" })
    expect(texts(verificationSections(page, t, context), "classification"))
      .toContain("Answered for by a person whose details were erased on 2026-11-23 11:00 UTC.")
  })

  it("M5 de #551 : des tests dont la branche a changé la définition ne comptent pas comme une vérification", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme" } },
      { type: "test.result", actor: { kind: "runner", id: "r" }, data: { kind: "test", command: "npm test", ran: true, passed: true, definitionChanged: ["package.json"] } },
      { type: "mission.ended", data: { status: "DONE", commits: 1 } },
    ]))
    expect(page.checks.some((c) => c.what === "tests")).toBe(false)
    expect(texts(verificationSections(page, t, context), "notChecked")).toContain(
      "The branch changed “package.json”, which defines how its tests run: the tests ran as the agent's version defines them, so their result is not a check.")
    expect(summarySentence(page, t)).toContain(t.summary.testsOwn)
  })

  it("L-b du second tour de #551 : la liste que le runner a regardée, et la commande de test du projet, dites pour ce qu'elles sont", () => {
    const tested = (data: Record<string, unknown>) => verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", accountable: `who:${"1".repeat(32)}` } },
      { type: "test.result", actor: { kind: "runner", id: "r" }, data: { kind: "test", command: "npm test", ran: true, passed: true, ...data } },
      { type: "mission.ended", data: { status: "DONE", commits: 1 } },
    ]))
    const listed = tested({ definitions: ["package.json", "vitest.config.ts"] })
    expect(texts(verificationSections(listed, t, context), "checks")).toContain("None of these files, which define how the tests run, changed "
      + "during the mission: “package.json”; “vitest.config.ts”. It is the list TaskForce looks for, not a proof that the tests are the same.")
    const setting = tested({ definitionChanged: ["taskforce:test-command"], definitions: ["package.json"] })
    expect(setting.checks.some((c) => c.what === "tests")).toBe(false)
    expect(texts(verificationSections(setting, t, context), "notChecked")).toContain(t.notChecked.testCommandChanged)
    expect(JSON.stringify(verificationSections(setting, t, context))).not.toContain("taskforce:test-command")
    expect(summarySentence(setting, t)).toContain(t.summary.testsSetting)
    const both = tested({ definitionChanged: ["package.json", "taskforce:test-command"] })
    expect(texts(verificationSections(both, t, context), "notChecked")).toContain(t.notChecked.testsOwnDefinitionAndCommand.replace("{paths}", "“package.json”"))
    expect(summarySentence(both, t)).toContain(t.summary.testsOwn)
  })

  it("L-c du second tour de #551 : le fournisseur lu dans la configuration du lancement le dit", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", agent: { kind: "claude-code", model: "sonnet" } } },
      { type: "note", actor: { kind: "agent", id: "claude-code" }, data: { kind: "agent", model: "claude-sonnet-5-20261001", provider: "amazon-bedrock",
        providerFrom: "launch-configuration", version: "2.1.300" } },
    ]))
    expect(page.model.providerFrom).toBe("launch-configuration")
    expect(texts(verificationSections(page, t, context), "model")).toEqual(expect.arrayContaining(["Served by Amazon Bedrock.", t.model.providerFrom]))
    expect(texts(verificationSections(verificationPage(example()), t, context), "model")).not.toContain(t.model.providerFrom)
  })

  it("N2 du second tour de #551 : une décision prise sur un fait coupé pour tenir au dossier ne se rejuge pas, et la page le dit", async () => {
    const file = example()
    // Coupé comme le runner coupe : 4 000 unités, la marque au bout, qui annonce plus (troisième tour de #551, c-b).
    const long = `src/${"a".repeat(5000)}.ts`
    const mark = `\n[TaskForce cut this text here: ${long.length} characters in all]`
    const cut = `${long.slice(0, 4000 - mark.length)}${mark}`
    const events = file.events.filter((e) => !(e.type === "note" && (e.data as { kind?: unknown } | null)?.kind === "witness")).map((e) => {
      const d = (e.data ?? {}) as Record<string, unknown>
      const facts = e.seq === 7 && Array.isArray(d.facts) ? (d.facts as Array<Record<string, string>>)
        .map((part) => ({ ...part, path: cut })) : d.facts
      return { type: e.type, at: e.at, actor: e.actor, data: facts === undefined ? d : { ...d, facts } }
    })
    const record = chained(events, { mission: file.mission, rules: file.rules, texts: file.texts })
    const page = verificationPage(record, await checkRecord(record, [], at))
    expect(page.check?.details?.rules).toMatchObject({ cut: 1, digestHolds: true, differ: [] })
    expect(verdictLines(page, t).map((l) => l.text)).toContain(
      "1 recorded decision was not judged again by this page: 1 on a fact longer than the record keeps (cut at 4,000 characters).")
    expect(verdictLines(verificationPage(example(), await checkRecord(example(), [], at)), t).map((l) => l.text).join(" ")).not.toContain("not judged again")
  })

  it("troisième tour de #551 : une décision des règles sans ses faits se compte aussi, avec celles d'un fait coupé", async () => {
    const file = example()
    const events = file.events.filter((e) => !(e.type === "note" && (e.data as { kind?: unknown } | null)?.kind === "witness")).map((e) => {
      const d = (e.data ?? {}) as Record<string, unknown>
      return e.seq === 7 ? { ...e, data: { ...d, facts: [] } } : e
    })
    const record = rechained(file, events)
    const page = verificationPage(record, await checkRecord(record, [], at))
    expect(page.check?.details?.rules.noFacts).toBe(1)
    expect(verdictLines(page, t).map((l) => l.text)).toContain("1 recorded decision was not judged again by this page: 1 without its facts.")
  })

  it("C1 du troisième tour de #551 : une action trop longue pour être accordée se lit dans les décisions, en mots simples", () => {
    const command = `psql -v pad=${"a".repeat(30)}`
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", accountable: "who:0" } },
      { type: "action.decided", actor: { kind: "rule", id: "cap:fact-length" }, data: { kind: "decision", tool: "Bash", text: command, effect: "deny",
        facts: [{ action: "shell", tool: "Bash", command }] } },
      { type: "mission.ended", data: { status: "DONE" } },
    ]))
    const lines = texts(verificationSections(page, t, context), "decisions")
    expect(lines.some((l) => l.startsWith(`The runner refused the command “${command}”, as the agent wrote it: one part of it was longer than 4,000 characters, too long for TaskForce to have it approved, so no one was asked,`))).toBe(true)
    expect(lines.some((l) => l.endsWith("by the runner, on the computer where the agent works."))).toBe(true)
    expect(lines).not.toContain(t.decisions.noReason)
  })

  it("c-c du troisième tour de #551 : l'arrêt au plafond dit que les dernières secondes ont pu ne pas s'écrire", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme" } },
      { type: "limit.reached", data: { max: 10000, stopped: true } },
      { type: "mission.ended", data: { status: "FAILED", error: "Evidence cap reached: TaskForce stopped the mission." } },
    ]))
    expect(texts(verificationSections(page, t, context), "changed").join(" ")).toContain(
      "What the agent did in its last seconds, before the runner stopped it, may not have been written.")
  })

  it("f34130dc : qui répond d'une règle, nommé par son `who:` et sa note ; `who:unknown`, par personne", () => {
    const rules = (owner: string) => ({ format: "taskforce-rules/1", rules: [{ id: "search-web", class: "read", text: "Search the web", owner }] })
    const decided = { type: "action.decided", actor: { kind: "rule", id: "search-web" }, data: { kind: "decision", tool: "WebSearch", effect: "allow",
      facts: [{ action: "web.search", tool: "WebSearch", query: "q" }] } }
    const unknown = verificationPage(chained([{ type: "mission.started", data: { mission: 7, workspace: "acme" } }, decided], { rules: rules("who:unknown") }))
    expect(unknown.classOf.heaviest?.rule.owner).toEqual({ kind: "unnamed" })
    expect(texts(verificationSections(unknown, t, context), "classification")).toContain("Answered for by someone the record does not name.")
  })

  it("une fusion sur GitHub nomme le compte par son texte ; une commande accordée se cite comme l'agent l'a écrite", () => {
    const login = `sha256:${"c".repeat(64)}`
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme" } },
      { type: "action.decided", data: { approval: 4, effect: "ask", tool: "Bash", summary: "echo \"approved by security\"", rule: "x" } },
      { type: "human.decision", actor: { kind: "person", id: "ada@example.com" }, data: { approval: 4, decision: "ALLOWED", tool: "Bash", summary: "echo \"approved by security\"" } },
      { type: "mission.ended", data: { status: "DONE" } },
      { type: "human.decision", actor: { kind: "person", id: "github" }, data: { decision: "MERGE", where: "github", by: { sha256: login, chars: 7 } } },
    ], { texts: { [login]: { salt: "0".repeat(32), text: "octocat" } } }))
    const lines = texts(verificationSections(page, t, context), "decisions")
    expect(lines[0]).toBe("Final decision: Merged on GitHub by octocat.")
    // Une chaîne d'avant la 1.18 (pas de `accountable`) nomme la personne par son courriel : la page le masque (N4).
    expect(lines.some((l) => l.startsWith("A person (email hidden) allowed the command “echo \"approved by security\"”, as the agent wrote it,"))).toBe(true)
  })

  it("une demande échue, un fournisseur autre, une session gardée à part", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", agent: { kind: "codex", model: "o4" } } },
      { type: "action.decided", data: { approval: 3, effect: "ask", summary: "npm install", tool: "Bash", rule: "x" } },
      { type: "action.decided", data: { approval: 3, effect: "deny", reason: "No answer in time." } },
      { type: "note", actor: { kind: "agent", id: "codex" }, data: { kind: "agent", model: "o4-2026", provider: "another-endpoint", version: "1.0" } },
      { type: "note", actor: { kind: "runner", id: "r" }, data: { kind: "runner", session: { sha256: `sha256:${"9".repeat(64)}`, bytes: 10 } } },
    ]))
    const sections = verificationSections(page, t, context)
    expect(texts(sections, "decisions").some((l) => l.startsWith("No one answered in time about the command “npm install”"))).toBe(true)
    expect(texts(sections, "model")).toEqual(expect.arrayContaining(["Agent: Codex, version 1.0.", t.model.providerOther]))
    expect(texts(sections, "model").some((l) => l.startsWith("The agent's raw session is kept apart"))).toBe(true)
  })

  it("R161 M2 : le résumé de l'agent en blocs simples, sans lien ni image, son code cité", () => {
    expect(summaryBlocks("## What I did\nI fixed `a.ts` and [the docs](https://x.y).\n\n- one\n* two\n```\ncode line\n```\n![img](u)"))
      .toEqual([
        { kind: "heading", parts: [{ code: false, text: "What I did" }] },
        { kind: "paragraph", parts: [{ code: false, text: "I fixed " }, { code: true, text: "a.ts" }, { code: false, text: " and the docs." }] },
        { kind: "item", parts: [{ code: false, text: "one" }] },
        { kind: "item", parts: [{ code: false, text: "two" }] },
        { kind: "paragraph", parts: [{ code: true, text: "code line" }] },
        { kind: "paragraph", parts: [{ code: false, text: "img" }] },
      ])
    expect(inlineParts("**bold** __too__")).toEqual([{ code: false, text: "bold too" }])
  })

  it("R159 P7 : un lien seulement vers GitHub ; R161 F4, des empreintes sans points de suspension", () => {
    expect(linkable("https://github.com/acme/website/pull/212")).toBe(true)
    expect(linkable("javascript:alert(1)")).toBe(false)
    expect(linkable("https://evil.example/github.com")).toBe(false)
    const page = verificationPage(chained([{ type: "mission.started", data: { mission: 7, workspace: "acme" } },
      { type: "mission.ended", data: { status: "DONE", resultUrl: "javascript:alert(1)//github.com/a/b/pull/1" } }]))
    expect(page.changes.pullRequest).toBeNull()
    expect(short(`sha256:${"a".repeat(64)}`)).toBe("sha256:aaaaaaaaaaaa")
    expect(short("abcdef0123456789")).toBe("abcdef012345")
    expect(short(null)).toBe("?")
    expect(when("2026-11-22T08:00:00.000Z")).toBe("2026-11-22 08:00 UTC")
    expect(when(null)).toBe("?")
    expect(when("not a date")).toBe("not a date")
  })
})

describe("R161 N1 et R159 V1, second tour de #552 : un dossier changé se voit d'un coup d'œil", () => {
  const alertOf = async (file: ReturnType<typeof example>, keys: string[] = [exampleKey()]) =>
    alertLines(verdictLines(verificationPage(file, await checkRecord(file, keys, at)), t)).map((l) => l.text)

  it("la chaîne cassée, l'en-tête changé, le sceau qui ne tient pas, le témoin qui ne tient pas : chacun dans l'alerte", async () => {
    expect((await alertOf(brokenChain().file)).join(" ")).toMatch(/Its chain breaks at event \d+/)
    const header = example()
    header.mission = { ...(header.mission ?? {}), requestedBy: "who:00000000000000000000000000000000" }
    expect(await alertOf(header)).toEqual([t.verdict.header.replace("{fields}", "requestedBy")])
    const seal = example()
    const envelope = seal.seal as { signatures: Array<{ keyid: string; sig: string }> }
    envelope.signatures = envelope.signatures.map((s) => ({ ...s, sig: `${s.sig.slice(0, -4)}AAA=` }))
    expect(await alertOf(seal)).toEqual([t.verdict.broken])
    const { file, key } = rewrittenResealed("separate-machine")
    expect((await alertOf(file, [key])).join(" ")).toContain("The witness in the pull request names event 23")
  })

  it("un dossier qui tient, et ses réserves ordinaires (la clé, le runner) : aucune alerte", async () => {
    expect(await alertOf(example())).toEqual([])
    expect(await alertOf(tamperedTitle().file)).toEqual([])
  })
})

describe("R161 N3 du second tour de #552 : les décisions qui n'existent pas", () => {
  it("une mission d'avant la 1.18 : le dossier ne dit pas si quelqu'un a tranché", () => {
    const page = verificationPage(olderFailed())
    expect(summarySentence(page, t)).toContain(t.decisions.undecidedOlder)
    expect(summarySentence(page, t)).not.toContain(t.summary.undecided)
    expect(texts(verificationSections(page, t, context), "decisions")[0]).toBe(t.decisions.undecidedOlder)
  })

  it("une mission arrêtée au plafond, ou qui a échoué : pas de résultat à trancher", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", accountable: `who:${"1".repeat(32)}` } },
      { type: "limit.reached", data: { max: 10000, stopped: true } },
      { type: "mission.ended", data: { status: "FAILED", error: "Evidence cap reached: TaskForce stopped the mission." } },
    ]))
    expect(summarySentence(page, t)).toContain(t.decisions.noResult)
    expect(texts(verificationSections(page, t, context), "decisions")[0]).toBe(t.decisions.noResult)
  })

  it("une mission finie sans geste de fin : le résultat attend, et seulement alors", () => {
    const page = verificationPage(chained([
      { type: "mission.started", data: { mission: 7, workspace: "acme", accountable: `who:${"1".repeat(32)}` } },
      { type: "mission.ended", data: { status: "DONE" } },
    ]))
    expect(summarySentence(page, t)).toContain(t.summary.undecided)
    expect(texts(verificationSections(page, t, context), "decisions")[0]).toBe(t.decisions.undecided)
  })
})

describe("R159 de #552, second tour : la ligne du sceau et la première ligne suivent ce qui a été vérifié (V2, V3)", () => {
  const recordOf = async (file: ReturnType<typeof example>) =>
    texts(verificationSections(verificationPage(file, await checkRecord(file, [exampleKey()], at)), t, context), "record")

  it("V2 : un sceau qui ne tient pas ne « couvre » rien, et jamais « Events 26 to 24 »", async () => {
    const signature = example()
    const envelope = signature.seal as { signatures: Array<{ keyid: string; sig: string }> }
    envelope.signatures = envelope.signatures.map((s) => ({ ...s, sig: `${s.sig.slice(0, -4)}AAA=` }))
    const broken = await recordOf(signature)
    expect(broken).toContain(t.record.sealBroken)
    expect(broken.join(" ")).not.toContain("The seal covers")
    // Le dernier événement retiré, la racine refaite : le sceau nomme un événement que le dossier n'a plus.
    const shorter = example()
    shorter.events = shorter.events.slice(0, -1)
    shorter.root = shorter.events.at(-1)?.hash ?? ""
    const head = await recordOf(shorter)
    expect(head).toContain(t.record.sealBroken)
    expect(head.join(" ")).not.toMatch(/Events \d+ to \d+ came after the seal/)
    // Un sceau qui tient : sa ligne vient de ce que la page a vérifié.
    expect((await recordOf(example())).some((l) => /^The seal covers the record up to event 25, signed on 2026-11-24 13:32 UTC with the key sha256:4e5afb8a11bc\.$/.test(l))).toBe(true)
  })

  it("V2 : sans chaîne qui tienne, le sceau n'est pas vérifié, et la page le dit", async () => {
    const lines = await recordOf(brokenChain().file)
    expect(lines).toContain(t.record.sealUnchecked)
    expect(lines.join(" ")).not.toContain("The seal covers")
  })

  it("V3 : la première ligne ne dit l'en-tête tiré de la chaîne que s'il l'est", async () => {
    const header = example()
    header.mission = { ...(header.mission ?? {}), requestedBy: "who:00000000000000000000000000000000" }
    const first = verdictLines(verificationPage(header, await checkRecord(header, [exampleKey()], at)), t)[0]?.text ?? ""
    expect(first).toMatch(/^Checked in this app on .+: every digest of the chain holds \(25 events\), and the 11 texts kept beside it match their digests\.$/)
    expect(first).not.toContain("the header comes from the chain")
    const sound = verdictLines(verificationPage(example(), await checkRecord(example(), [exampleKey()], at)), t)[0]?.text ?? ""
    expect(sound).toContain("the header comes from the chain")
  })
})

describe("R159 de #552, second tour : la page lit le témoin (V1)", () => {
  const witnessOf = (file: ReturnType<typeof example>) => file.events.find((e) => e.type === "note" && (e.data as { kind?: unknown }).kind === "witness")

  it.each(["separate-machine", "same-machine"] as const)("un dossier réécrit puis re-signé par une clé que l'instance liste (garde %s) : le témoin ne tient pas, et la page le dit", async (custody) => {
    const { file, key } = rewrittenResealed(custody)
    const check = await checkRecord(file, [key], at)
    expect(check.details?.seal.state).toBe("trusted")
    const page = verificationPage(file, check)
    expect(page.record.witness?.holds).toBe(false)
    const verdict = verdictLines(page, t).map((l) => l.text).join(" ")
    expect(verdict).toContain("The witness in the pull request names event 23 with sha256:444a25d36e50, which is not in this record")
    const record = texts(verificationSections(page, t, context), "record")
    expect(record.some((l) => l.startsWith("Witness: the head"))).toBe(false)
    expect(record).toContain(t.record.witnessBroken.replace("{seq}", "23").replace("{root}", "sha256:444a25d36e50"))
  })

  it("un témoin qui tient : la page montre l'empreinte que la chaîne donne à l'événement, à comparer au commentaire", async () => {
    const file = example()
    const page = verificationPage(file, await checkRecord(file, [exampleKey()], at))
    expect(page.record.witness?.holds).toBe(true)
    const chainRoot = file.events[22]?.hash ?? ""
    expect(page.record.witness?.chainRoot).toBe(chainRoot)
    const line = texts(verificationSections(page, t, context), "record").find((l) => l.startsWith("Witness: the head"))
    expect(line).toContain(`(${short(chainRoot)})`)
    expect(verdictLines(page, t).map((l) => l.text).join(" ")).not.toContain("which is not in this record")
  })

  it("v-c : une clé que l'instance liste n'est pas une garantie ; l'ancre est le commentaire de la pull request", async () => {
    const { file, key } = resealed(example(), "separate-machine")
    const page = verificationPage(file, await checkRecord(file, [key], at))
    expect(verdictLines(page, t).map((l) => l.text)).toContain(t.verdict.trusted)
    expect(t.verdict.trusted).toContain("what anchors the key is the comment in the pull request")
  })

  it("c-d du troisième tour de #551 : un premier échec se dit repris jusqu'au septième jour après la fin ; l'abandon, avec sa date", async () => {
    const source = example()
    const withNote = (note: Record<string, unknown>) => rechained(source, source.events.map((e) => (e === witnessOf(source)
      ? { ...e, data: { kind: "witness", where: "github-pull-request", pullRequest: "https://github.com/acme/website/pull/212", root: source.events[22]?.hash, seq: 23, ...note } }
      : e)))
    const ended = source.events.find((e) => e.type === "mission.ended")?.at ?? ""
    const until = when(new Date(new Date(ended).getTime() + 7 * 24 * 3600 * 1000).toISOString())
    const retrying = withNote({ written: false, retrying: true, reason: "GitHub can't be reached: nothing changed. Try again in a moment." })
    const retryingPage = verificationPage(retrying, await checkRecord(retrying, [], at))
    expect(texts(verificationSections(retryingPage, t, context), "record")).toContain(
      `No witness yet: GitHub can't be reached: nothing changed. Try again in a moment. TaskForce tries again until ${until}.`)
    const abandoned = withNote({ written: false, abandoned: true, reason: "TaskForce could not write it in the pull request within the seven days after the mission ended, and stopped trying" })
    const abandonedPage = verificationPage(abandoned, await checkRecord(abandoned, [], at))
    const notedAt = abandoned.events.find((e) => e.type === "note" && (e.data as { kind?: unknown }).kind === "witness")?.at ?? null
    expect(texts(verificationSections(abandonedPage, t, context), "record")).toContain(
      t.record.witnessAbandoned.replace("{date}", when(notedAt)))
  })
})
