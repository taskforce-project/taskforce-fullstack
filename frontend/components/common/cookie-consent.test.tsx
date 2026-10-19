import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { CookieConsent } from "./cookie-consent"

describe("CookieConsent", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("sans clé PostHog (instance auto-hébergée, dev) : rien à accepter, pas de bandeau", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "")
    const { container } = render(<CookieConsent />)
    expect(container).toBeEmptyDOMElement()
  })

  it("avec une clé PostHog et aucun choix enregistré : le bandeau demande le consentement", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test")
    render(<CookieConsent />)
    expect(screen.getByRole("dialog", { name: "Cookie preferences" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reject all" })).toBeInTheDocument()
  })
})
