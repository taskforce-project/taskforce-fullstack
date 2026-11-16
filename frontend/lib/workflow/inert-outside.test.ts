import { describe, expect, it } from "vitest"

import { inertOutside } from "@/lib/workflow/inert-outside"

function page() {
  document.body.innerHTML = `
    <div id="app-root">
      <nav id="nav"><a href="/">Projects</a></nav>
      <main id="main">
        <header id="tabs"><a href="/board">Board</a></header>
        <div id="page"><div id="view"><button>Card</button></div><aside id="aside" inert></aside></div>
      </main>
    </div>
    <section id="toaster"></section>`
  const get = (id: string) => document.getElementById(id) as HTMLElement
  return { get, root: get("app-root"), view: get("view") }
}

describe("inertOutside", () => {
  it("rend inerte ce qui entoure l'élément jusqu'aux enfants de la racine, jamais l'élément, ses parents ni ce qui est hors d'elle", () => {
    const { get, root, view } = page()
    const restore = inertOutside(view, root)
    expect(get("nav")).toHaveAttribute("inert")
    expect(get("tabs")).toHaveAttribute("inert")
    for (const id of ["view", "page", "main", "app-root", "toaster"]) expect(get(id)).not.toHaveAttribute("inert")
    restore()
    expect(get("nav")).not.toHaveAttribute("inert")
    expect(get("tabs")).not.toHaveAttribute("inert")
    // Ce qui était déjà inerte le reste.
    expect(get("aside")).toHaveAttribute("inert")
  })

  it("ne touche à rien pour un élément hors de la racine, ou la racine elle-même", () => {
    const { get, root } = page()
    inertOutside(get("toaster"), root)()
    inertOutside(root, root)()
    expect(document.querySelectorAll("[inert]")).toHaveLength(1)
    const restore = inertOutside(get("toaster"), root)
    expect(document.querySelectorAll("[inert]")).toHaveLength(1)
    restore()
  })
})
