import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import Link from "next/link"

import { RecordUnavailable } from "./record-unavailable"
import { CONSTANTS_EN } from "@/lib/constants_en"

/**
 * Un dossier qu'on ne montre pas (R161 M3 de #552) : la page de vérification, le lien d'un témoin et l'espace dont la
 * personne n'est pas membre le disent de la même façon. Son essai à lui (R159 de #552, second tour, v-h).
 */
const t = CONSTANTS_EN.verification

describe("RecordUnavailable", () => {
  it("un titre qui nomme la page, ce qui s'est passé, quoi faire, et le chemin du retour", () => {
    render(<RecordUnavailable title={t.title} message={t.denied} hint={t.deniedHint} back={<Link href="/acme/missions/42">{t.back}</Link>} />)

    const article = screen.getByRole("article", { name: t.title })
    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(t.denied)
    expect(screen.getByText(t.deniedHint)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.back })).toHaveAttribute("href", "/acme/missions/42")
    // L'action seulement quand il y en a une : un refus n'en a pas.
    expect(article.querySelectorAll("button")).toHaveLength(0)
  })

  it("une panne propose son action, entre le conseil et le retour", () => {
    render(<RecordUnavailable title={t.title} message={t.failed} hint={t.failedHint}
      action={<button type="button">{t.tryAgain}</button>} back={<Link href="/acme/missions/42">{t.back}</Link>} />)

    const action = screen.getByRole("button", { name: t.tryAgain })
    const back = screen.getByRole("link", { name: t.back })
    const hint = screen.getByText(t.failedHint)
    expect(hint.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(action.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
