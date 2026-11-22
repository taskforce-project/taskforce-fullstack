import { readFileSync } from "node:fs"
import path from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const saved = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ workspace: "acme" }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api/project-service", () => ({ saveBlob: saved.saveBlob }))

import { VerificationView } from "./verification-view"
import type { MissionEvidence } from "@/lib/api/delivery-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useDeliveryStore } from "@/lib/store/delivery-store"

/** La page de vérification à l'écran (R212) : remplie depuis le dossier seul, rien d'écrit à la main, et elle s'exporte. */
const example = (): MissionEvidence =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../../contracts/evidence/example-mission.json"), "utf8")) as MissionEvidence
const t = CONSTANTS_EN.verification

describe("VerificationView", () => {
  const fetchEvidence = vi.fn<(slug: string, runId: number) => Promise<MissionEvidence | null>>()

  beforeEach(() => {
    vi.clearAllMocks()
    const file = example()
    fetchEvidence.mockResolvedValue(file)
    useDeliveryStore.setState({ evidence: { 42: file }, fetchEvidence })
  })

  it("reads the record of the mission, and only it", () => {
    render(<VerificationView runId={42} />)

    expect(fetchEvidence).toHaveBeenCalledWith("acme", 42)
    expect(screen.getByRole("heading", { name: "Verification: WEB-48" })).toBeInTheDocument()
    expect(screen.getByText(t.audience)).toBeInTheDocument()
    expect(screen.getByText(t.assembled)).toBeInTheDocument()
  })

  it("shows the seven sections, then the record itself, the agent's summary marked as its own words", () => {
    render(<VerificationView runId={42} />)

    for (const title of Object.values(t.sections)) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    expect(screen.getByText("Requested: Fix the footer links")).toBeInTheDocument()
    expect(screen.getByText(t.changed.summary)).toBeInTheDocument()
    expect(document.querySelectorAll("pre[data-agent='true']")).toHaveLength(1)
    expect(screen.getByText(/Class of the change: Cannot be undone/)).toBeInTheDocument()
    expect(screen.getByText("Model that ran: claude-sonnet-5-20261001.")).toBeInTheDocument()
    expect(screen.getByText(t.record.custody["same-machine"])).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/complian|conforme/i)
  })

  it("goes back to the mission", () => {
    render(<VerificationView runId={42} />)

    fireEvent.click(screen.getByRole("link", { name: t.back }))
    expect(nav.push).toHaveBeenCalledWith("/acme/missions/42", { scroll: false })
  })

  it("exports the page with its record, in one file", async () => {
    render(<VerificationView runId={42} />)

    fireEvent.click(screen.getByRole("button", { name: t.record.download }))

    expect(saved.saveBlob).toHaveBeenCalledWith(expect.any(Blob), "verification-run-42.html")
    const blob = saved.saveBlob.mock.calls[0]?.[0] as Blob
    const html = await blob.text()
    expect(html).toContain("<section id=\"request\">")
    expect(html).toContain("id=\"taskforce-evidence\"")
    const { toast } = await import("sonner")
    expect(toast.success).toHaveBeenCalledWith(t.record.downloaded)
  })

  it("says when the export fails", async () => {
    saved.saveBlob.mockImplementationOnce(() => { throw new Error("no disk") })
    render(<VerificationView runId={42} />)

    fireEvent.click(screen.getByRole("button", { name: t.record.download }))

    const { toast } = await import("sonner")
    expect(toast.error).toHaveBeenCalledWith(t.record.downloadFailed)
  })

  it("waits for the record, and says when the mission has none", () => {
    fetchEvidence.mockReturnValue(new Promise(() => {}))
    useDeliveryStore.setState({ evidence: {} })
    const { unmount } = render(<VerificationView runId={42} />)
    expect(screen.getByRole("status")).toHaveTextContent(t.loading)
    unmount()

    useDeliveryStore.setState({ evidence: { 42: null } })
    render(<VerificationView runId={42} />)
    expect(screen.getByRole("status")).toHaveTextContent(t.none)
  })

  it("says when the record cannot be read, instead of waiting for it", async () => {
    fetchEvidence.mockResolvedValue(null)
    useDeliveryStore.setState({ evidence: {} })
    render(<VerificationView runId={42} />)

    expect(await screen.findByText(t.failed)).toBeInTheDocument()
  })
})
