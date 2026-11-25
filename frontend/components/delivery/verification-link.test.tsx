import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

// Le routeur de Next.js est le même d'un rendu à l'autre : le double aussi.
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({}),
}))

import { VerificationLink } from "./verification-link"
import type { EvidenceLink } from "@/lib/api/delivery-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useDeliveryStore } from "@/lib/store/delivery-store"

/**
 * Le lien du témoin d'un dossier, `/verify/<id>` (R159, second tour de #551, M-b) : il ne nomme ni l'espace ni la mission ;
 * la page demande où il mène, puis ouvre la page de vérification, ou dit le message neutre, jamais un renvoi muet.
 */
const t = CONSTANTS_EN.verification
const ID = "0123456789abcdef0123456789abcdef"

describe("VerificationLink", () => {
  const fetchEvidenceLink = vi.fn<(id: string) => Promise<EvidenceLink | null>>()

  beforeEach(() => {
    vi.clearAllMocks()
    useDeliveryStore.setState({ evidenceLinks: {}, fetchEvidenceLink })
  })

  it("demande où mène le lien, puis ouvre la page de vérification de la mission", async () => {
    fetchEvidenceLink.mockResolvedValue({ workspace: "acme", runId: 42 })
    render(<VerificationLink id={ID} />)

    expect(screen.getByRole("status")).toHaveTextContent(t.loading)
    expect(fetchEvidenceLink).toHaveBeenCalledWith(ID)
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/acme/missions/42/verification"))
  })

  it("un lien qui ne mène à rien de lisible : le message neutre, un titre, et le chemin de l'accueil", async () => {
    fetchEvidenceLink.mockImplementation(async (id) => {
      useDeliveryStore.setState({ evidenceLinks: { [id]: null } })
      return null
    })
    render(<VerificationLink id={ID} />)

    expect(await screen.findByText(t.denied)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.home })).toHaveAttribute("href", "/")
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("un identifiant qui n'en est pas un ne se demande pas au serveur", () => {
    render(<VerificationLink id="../acme" />)

    expect(screen.getByText(t.denied)).toBeInTheDocument()
    expect(fetchEvidenceLink).not.toHaveBeenCalled()
  })

  it("une lecture qui échoue le dit, et propose de réessayer", async () => {
    fetchEvidenceLink.mockResolvedValueOnce(null).mockResolvedValueOnce({ workspace: "acme", runId: 7 })
    render(<VerificationLink id={ID} />)

    expect(await screen.findByText(t.failed)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: t.tryAgain }))
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/acme/missions/7/verification"))
    expect(fetchEvidenceLink).toHaveBeenCalledTimes(2)
  })
})
