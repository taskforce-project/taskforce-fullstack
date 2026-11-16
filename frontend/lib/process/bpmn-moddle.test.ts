/**
 * L'export BPMN 2.0 d'un processus, lu et réécrit par bpmn-moddle, la bibliothèque de modèle de bpmn.io sur laquelle
 * repose le Desktop Modeler de Camunda (ADR-027, E23). Le fichier du contrat se lit sans un avertissement, l'extension
 * `tf:` survit à la réécriture, et le fichier réécrit est gardé dans `contracts/process/round-trip/` : le backend le
 * réimporte et retrouve la même empreinte (ProcessContractTest). Après un changement voulu de l'export,
 * `PROCESS_CONTRACTS_WRITE=1` réécrit ce fichier.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { BpmnModdle } from "bpmn-moddle"
import { describe, expect, it } from "vitest"

const CONTRACTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/process")
const EXPORT = path.join(CONTRACTS, "integrate-a-module.bpmn")
const REWRITTEN = path.join(CONTRACTS, "round-trip", "integrate-a-module.bpmn-moddle.bpmn")

interface ModdleElement {
  $type: string
  [key: string]: unknown
}

interface Moddle {
  fromXML(xml: string): Promise<{ rootElement: ModdleElement; warnings: { message: string }[] }>
  toXML(element: ModdleElement, options: { format: boolean }): Promise<{ xml: string }>
}

const count = (xml: string, tag: string) => xml.split(`<${tag}`).length - 1

describe("the BPMN 2.0 export of a process, through bpmn-moddle", () => {
  it("reads TaskForce's export without a single warning", async () => {
    const moddle = new BpmnModdle() as unknown as Moddle
    const { warnings } = await moddle.fromXML(readFileSync(EXPORT, "utf8"))

    expect(warnings.map((w) => w.message)).toEqual([])
  })

  it("writes it back with every tf: extension element, and keeps the rewritten file for the backend", async () => {
    const xml = readFileSync(EXPORT, "utf8")
    const moddle = new BpmnModdle() as unknown as Moddle
    const { rootElement } = await moddle.fromXML(xml)
    const { xml: rewritten } = await moddle.toXML(rootElement, { format: true })

    for (const tag of ["tf:process", "tf:step", "tf:agent", "tf:human", "tf:item", "tf:field", "tf:wait", "tf:rule",
      "tf:document", "tf:condition"]) {
      expect(count(rewritten, tag), tag).toBe(count(xml, tag))
    }
    expect(count(rewritten, "bpmndi:BPMNShape")).toBe(count(xml, "bpmndi:BPMNShape"))
    // Ce qu'il réécrit, il le relit lui aussi sans un avertissement.
    expect((await moddle.fromXML(rewritten)).warnings).toEqual([])
    if (process.env.PROCESS_CONTRACTS_WRITE === "1") writeFileSync(REWRITTEN, rewritten)
    // Un poste Windows peut avoir extrait le fichier en CRLF : la comparaison porte sur le texte, pas sur les fins de ligne.
    expect(readFileSync(REWRITTEN, "utf8").replace(/\r\n/g, "\n"),
      "the export changed: run with PROCESS_CONTRACTS_WRITE=1, then the backend's ProcessContractTest").toBe(rewritten)
  })
})
