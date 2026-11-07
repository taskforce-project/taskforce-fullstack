import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CommentBody } from "./comment-body"

/** Le commentaire de Cortex que le CEO a vu en Markdown brut (05/11/2026). */
const CORTEX_SUMMARY = [
  "## Résumé de l'issue OPS-35",
  "",
  "**Titre** : Itération #35",
  "",
  "**Résultats** : l'itération a été réussie.",
  "",
  "- Interface de connexion refaite",
  "- Sécurité renforcée",
].join("\n")

function show(content: string) {
  return render(<CommentBody content={content} />).container
}

describe("CommentBody : le texte d'un commentaire, rendu en Markdown", () => {
  it("shows the agent's summary without its Markdown marks", () => {
    const body = show(CORTEX_SUMMARY)

    expect(body.textContent).not.toMatch(/##|\*\*/)
    expect(screen.getByText("Résumé de l'issue OPS-35")).toHaveClass("font-semibold")
    expect(screen.getByText("Titre").tagName).toBe("STRONG")
    expect(screen.getByText(/Itération #35/)).toBeInTheDocument()
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Interface de connexion refaite",
      "Sécurité renforcée",
    ])
  })

  it("keeps the lines of a comment written by hand", () => {
    const body = show("First line\nsecond line")

    expect(body.querySelectorAll("br")).toHaveLength(1)
    expect(body.textContent).toBe("First linesecond line")
  })

  it.each([
    ["an image with a script", "<img src=x onerror=alert(1)>", "img"],
    ["a bold tag", "<b>bold</b>", "b"],
    ["a script", "<script>alert(1)</script>", "script"],
  ])("never reads HTML: %s stays text", (_label, content, tag) => {
    const body = show(content)

    expect(body.querySelector(tag)).toBeNull()
    expect(body.textContent).toBe(content)
  })

  it.each([
    ["a javascript: link", "[open](javascript:alert%281%29)", null],
    ["a data: link", "[open](data:text/html;base64,PHNjcmlwdD4=)", null],
    ["a web link", "[open](https://github.com/acme/web/pull/7)", "https://github.com/acme/web/pull/7"],
  ])("keeps only safe links: %s", (_label, content, href) => {
    show(content)

    const link = screen.queryByRole("link", { name: "open" })
    if (href === null) {
      expect(link).toBeNull()
      expect(screen.getByText("open")).toBeInTheDocument()
    } else {
      expect(link).toHaveAttribute("href", href)
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    }
  })
})
