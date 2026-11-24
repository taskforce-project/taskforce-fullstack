import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const saved = vi.hoisted(() => ({ saveBlob: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ workspace: "acme" }),
}))
vi.mock("sonner", () => ({ toast: toasts }))
vi.mock("@/lib/api/project-service", () => ({ saveBlob: saved.saveBlob }))

import { VerificationView } from "./verification-view"
import type { MissionEvidence } from "@/lib/api/delivery-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { brokenChain, example, exampleKey, large, running, tamperedTitle } from "@/lib/delivery/__tests__/records"
import { useDeliveryStore } from "@/lib/store/delivery-store"

/**
 * La page de vérification à l'écran (R212) : remplie depuis le dossier seul, vérifiée dans l'app avant d'en rien dire
 * (R161 B1), une phrase d'abord et le détail à un clic (R161 M1), et elle s'exporte. Les essais partent des captures de la
 * revue des écrans de #552 (R161) et des sondes de la relecture du code (R159).
 */
const t = CONSTANTS_EN.verification

describe("VerificationView", () => {
  const fetchEvidence = vi.fn<(slug: string, runId: number) => Promise<MissionEvidence | null>>()
  const fetchEvidenceKeys = vi.fn<(slug: string) => Promise<string[] | null>>()
  const downloadEvidence = vi.fn<(slug: string, runId: number, format: "json") => Promise<boolean>>()

  function show(file: MissionEvidence | null | undefined, keys: string[] | null = [exampleKey()]) {
    fetchEvidence.mockResolvedValue(file ?? null)
    fetchEvidenceKeys.mockResolvedValue(keys)
    useDeliveryStore.setState({
      evidence: file === undefined ? {} : { 42: file }, evidenceKeys: { acme: keys }, fetchEvidence, fetchEvidenceKeys, downloadEvidence,
    })
    return render(<VerificationView runId={42} />)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    downloadEvidence.mockResolvedValue(true)
  })

  it("R161 B1 : lit le dossier et les clés de l'instance, dit qu'elle vérifie, puis ce qu'elle a vérifié, où et quand", async () => {
    show(example())

    expect(fetchEvidence).toHaveBeenCalledWith("acme", 42)
    expect(fetchEvidenceKeys).toHaveBeenCalledWith("acme")
    expect(screen.getByRole("heading", { name: "Verification of WEB-48: Fix the footer links" })).toBeInTheDocument()
    expect(screen.getByText(t.checking)).toBeInTheDocument()
    expect(await screen.findByText(/^Checked in this app on .+: every digest of the chain holds \(25 events\)/)).toBeInTheDocument()
    expect(screen.getByText(t.verdict.trustedSameMachine)).toBeInTheDocument()
    expect(screen.getByText(t.verdict.runnerFacts)).toBeInTheDocument()
    expect(screen.queryByText(t.checking)).not.toBeInTheDocument()
  })

  it("une chaîne cassée se dit en tête ; un texte changé n'est pas montré comme la demande", async () => {
    const { unmount } = show(brokenChain().file)
    expect(await screen.findByText(/this record was changed after it was written\. Its chain breaks at event \d+/)).toBeInTheDocument()
    unmount()

    show(tamperedTitle().file)
    expect(await screen.findByText(t.verdict.textsOne)).toBeInTheDocument()
    expect(screen.getByText(/^The request's title was changed after the record was written/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("Fix the header links")
  })

  it("R161 M1 : une phrase d'abord ; chaque rubrique montre sa première ligne, le détail à un clic", async () => {
    show(example())
    await screen.findByText(/^Checked in this app on/)

    expect(screen.getByText(/^Ada asked for “Fix the footer links”\. 1 file changed, in a pull request\./)).toBeInTheDocument()
    for (const title of Object.values(t.sections)) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    const request = screen.getByRole("region", { name: t.sections.request })
    expect(within(request).getByText("Requested: Fix the footer links")).toBeInTheDocument()
    expect(within(request).queryByText(/^Written by Grace/)).not.toBeInTheDocument()

    const details = within(request).getByRole("button", { name: t.showDetails })
    expect(details).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(details)
    expect(details).toHaveAttribute("aria-expanded", "true")
    expect(within(request).getByText(/^Written by Grace on /)).toBeInTheDocument()
    expect(within(request).getByText("The footer still links to the old documentation site. Point the three links to docs.example.com.")).toBeInTheDocument()
    fireEvent.click(within(request).getByRole("button", { name: t.hideDetails }))
    expect(within(request).queryByText(/^Written by Grace/)).not.toBeInTheDocument()
  })

  it("R161 M2 et R159 P7 : le résumé de l'agent marqué comme le sien, sans Markdown brut ; un lien vers GitHub seulement", async () => {
    show(example())
    await screen.findByText(/^Checked in this app on/)

    const changed = screen.getByRole("region", { name: t.sections.changed })
    fireEvent.click(within(changed).getByRole("button", { name: t.showDetails }))
    const agent = document.querySelectorAll("[data-agent='true']")
    expect(agent).toHaveLength(1)
    expect(agent[0]?.textContent).toContain("What I did")
    expect(agent[0]?.textContent).not.toMatch(/##|`/)
    expect(within(changed).getByRole("link", { name: "https://github.com/acme/website/pull/212" }))
      .toHaveAttribute("href", "https://github.com/acme/website/pull/212")
    expect(document.body.textContent).not.toMatch(/complian|conforme|Checked off|Class of the change/i)
  })

  it("R161 M1 et M2 : douze fichiers et un long résumé se replient, avec leur nombre, au clavier", async () => {
    show(large(), [])
    await screen.findByText(/^Checked in this app on/)

    const changed = screen.getByRole("region", { name: t.sections.changed })
    expect(within(changed).getByText("src/file-9.ts", { exact: false })).toBeInTheDocument()
    expect(within(changed).queryByText("src/file-11.ts", { exact: false })).not.toBeInTheDocument()
    const files = within(changed).getByRole("button", { name: "Show all 12 files" })
    fireEvent.click(files)
    expect(within(changed).getByText("src/file-11.ts", { exact: false })).toBeInTheDocument()
    expect(within(changed).getByRole("button", { name: t.showFewerFiles })).toHaveAttribute("aria-expanded", "true")

    fireEvent.click(within(changed).getByRole("button", { name: t.showDetails }))
    expect(within(changed).queryByText("Step 8")).not.toBeInTheDocument()
    fireEvent.click(within(changed).getByRole("button", { name: t.showMore }))
    expect(within(changed).getByText("Step 8")).toBeInTheDocument()
    fireEvent.click(within(changed).getByRole("button", { name: t.showLess }))
    expect(within(changed).queryByText("Step 8")).not.toBeInTheDocument()
  })

  it("R161 B3 : une mission en cours le dit, avec l'heure de lecture, et se relit", async () => {
    show(running(), [])
    await screen.findByText(t.verdict.notSealedRunning)

    expect(screen.getByText(/^The mission is still running: this page shows its record as it was at \d{4}-\d\d-\d\d \d\d:\d\d UTC\.$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: t.refresh }))
    expect(fetchEvidence).toHaveBeenCalledTimes(2)
  })

  it("R159 P2 et R161 M3 : un 403 ou un 404, un seul message neutre, un titre et le retour à la mission", () => {
    show(null)

    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(t.denied)
    expect(screen.getByText(t.deniedHint)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: t.back }))
    expect(nav.push).toHaveBeenCalledWith("/acme/missions/42", { scroll: false })
  })

  it("R161 M3 : une lecture qui échoue le dit, avec un titre, et propose de réessayer", async () => {
    show(undefined)

    expect(await screen.findByText(t.failed)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.back })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: t.tryAgain }))
    expect(fetchEvidence).toHaveBeenCalledTimes(2)
  })

  it("attend le dossier sans rien affirmer", () => {
    fetchEvidence.mockReturnValue(new Promise(() => {}))
    fetchEvidenceKeys.mockResolvedValue([])
    useDeliveryStore.setState({ evidence: {}, evidenceKeys: {}, fetchEvidence, fetchEvidenceKeys, downloadEvidence })
    render(<VerificationView runId={42} />)

    expect(screen.getByRole("status")).toHaveTextContent(t.loading)
  })

  it("R161 B1, M6 et F5 : la page ne s'exporte qu'une fois vérifiée, en un fichier qui dit ce qui a été vérifié, et porte son dossier", async () => {
    show(example())
    const download = screen.getByRole("button", { name: t.record.download })
    expect(download).toBeDisabled()
    await screen.findByText(/^Checked in this app on/)
    expect(download).toBeEnabled()

    fireEvent.click(download)

    expect(saved.saveBlob).toHaveBeenCalledWith(expect.any(Blob), "verification-run-42.html")
    const html = await (saved.saveBlob.mock.calls[0]?.[0] as Blob).text()
    expect(html).toContain("<details class=\"section\" id=\"request\" open>")
    expect(html).toContain("id=\"taskforce-evidence\"")
    expect(html).toContain("Content-Security-Policy")
    expect(html).toMatch(/Assembled by TaskForce .+ \(.*\) on \d{4}-\d\d-\d\d \d\d:\d\d UTC, from the record of mission 42 of the workspace acme\./)
    expect(html).toContain("npm run verify -- evidence-run-42.json")
    expect(toasts.success).toHaveBeenCalledWith(t.record.downloaded)
  })

  it("dit quand l'export échoue", async () => {
    saved.saveBlob.mockImplementationOnce(() => {
      throw new Error("no disk")
    })
    show(example())
    await screen.findByText(/^Checked in this app on/)

    fireEvent.click(screen.getByRole("button", { name: t.record.download }))

    expect(toasts.error).toHaveBeenCalledWith(t.record.downloadFailed)
  })

  it("R161 M6 : offre le dossier lui-même, en JSON, à côté de la page", async () => {
    show(example())

    fireEvent.click(screen.getByRole("button", { name: t.record.downloadRecord }))
    expect(downloadEvidence).toHaveBeenCalledWith("acme", 42, "json")
    await vi.waitFor(() => expect(toasts.success).toHaveBeenCalledWith(t.record.recordDownloaded))

    downloadEvidence.mockResolvedValueOnce(false)
    fireEvent.click(screen.getByRole("button", { name: t.record.downloadRecord }))
    await vi.waitFor(() => expect(toasts.error).toHaveBeenCalledWith(t.record.recordDownloadFailed))
  })
})
