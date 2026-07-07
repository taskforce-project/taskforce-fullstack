import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { usePagination } from "./use-pagination"

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe("usePagination", () => {
  it("tranche la première page selon la taille par défaut (25)", () => {
    const { result } = renderHook(() => usePagination(range(60)))
    expect(result.current.total).toBe(60)
    expect(result.current.pageSize).toBe(25)
    expect(result.current.pageCount).toBe(3)
    expect(result.current.pageItems).toHaveLength(25)
    expect(result.current.pageItems[0]).toBe(1)
  })

  it("respecte une taille initiale personnalisée", () => {
    const { result } = renderHook(() => usePagination(range(10), 5))
    expect(result.current.pageCount).toBe(2)
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5])
  })

  it("navigue vers la page suivante et renvoie la bonne tranche", () => {
    const { result } = renderHook(() => usePagination(range(60), 25))
    act(() => result.current.setPage(2))
    expect(result.current.pageItems[0]).toBe(26)
    expect(result.current.pageItems).toHaveLength(25)
  })

  it("la dernière page peut être partielle", () => {
    const { result } = renderHook(() => usePagination(range(52), 25))
    act(() => result.current.setPage(3))
    expect(result.current.pageItems).toEqual([51, 52])
  })

  it("changer la taille de page remet à la page 1", () => {
    const { result } = renderHook(() => usePagination(range(60), 25))
    act(() => result.current.setPage(3))
    act(() => result.current.setPageSize(10))
    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(10)
    expect(result.current.pageCount).toBe(6)
  })

  it("re-clampe la page si la liste rétrécit sous la page courante", () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: range(50) }, // 5 pages
    })
    act(() => result.current.setPage(5))
    expect(result.current.page).toBe(5)
    rerender({ items: range(12) }) // 2 pages → doit re-clamper à 2
    expect(result.current.page).toBe(2)
  })

  it("expose au moins 1 page pour une liste vide", () => {
    const { result } = renderHook(() => usePagination<number>([], 25))
    expect(result.current.pageCount).toBe(1)
    expect(result.current.pageItems).toHaveLength(0)
    expect(result.current.total).toBe(0)
  })
})
