import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push }),
}))

import { DashboardHero } from "./dashboard-hero"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { useProjectStore } from "@/lib/store/project-store"
import type { Project } from "@/lib/api/project-service"

type User = ReturnType<typeof userEvent.setup>

const field = () => screen.getByRole("textbox", { name: /search an operation/i })

async function openWith(user: User, query: string) {
  await user.click(field())
  await user.keyboard(query)
}

/**
 * Palette inline du dashboard : choisir une ligne (clic ou Entrée) ou fermer (Échap) vide la recherche,
 * ferme le menu et sort du champ. `reset` ne lit plus le champ par une ref (react-hooks 7.1) : ces tests
 * gardent le comportement d'avant.
 */
describe("DashboardHero - palette inline", () => {
  beforeEach(() => {
    push.mockClear()
    useSettingsStore.setState({ open: false })
    useCreateProjectStore.setState({ open: false })
    useProjectStore.setState({
      projects: [{ id: 7, name: "Apollo", identifier: "APO", iconUrl: null, color: "#2f6bf6" } as Project],
    })
  })

  it("Échap vide la recherche, ferme le menu et sort du champ", async () => {
    const user = userEvent.setup()
    render(<DashboardHero displayName="Ada" />)
    await openWith(user, "apo")
    expect(screen.getByText("Apollo")).toBeInTheDocument()

    await user.keyboard("{Escape}")

    expect(field()).not.toHaveFocus()
    expect(field()).toHaveValue("")
    expect(screen.queryByText("Apollo")).not.toBeInTheDocument()
  })

  it.each([
    { how: "un clic sur une opération", query: "apo", pick: (user: User) => user.click(screen.getByText("Apollo")), path: "/acme/projects/7" },
    { how: "Entrée sur la ligne surlignée", query: "inbox", pick: (user: User) => user.keyboard("{Enter}"), path: "/acme/inbox" },
  ])("ouvre la page choisie par $how et sort du champ", async ({ query, pick, path }) => {
    const user = userEvent.setup()
    render(<DashboardHero displayName="Ada" />)
    await openWith(user, query)

    await pick(user)

    expect(push).toHaveBeenCalledWith(path)
    expect(field()).not.toHaveFocus()
    expect(field()).toHaveValue("")
  })

  it.each([
    { label: "Settings", isOpen: () => useSettingsStore.getState().open },
    { label: "Create an operation", isOpen: () => useCreateProjectStore.getState().open },
  ])("lance l'action $label et sort du champ", async ({ label, isOpen }) => {
    const user = userEvent.setup()
    render(<DashboardHero displayName="Ada" />)
    await user.click(field())

    await user.click(screen.getByText(label))

    expect(isOpen()).toBe(true)
    expect(push).not.toHaveBeenCalled()
    expect(field()).not.toHaveFocus()
  })
})
