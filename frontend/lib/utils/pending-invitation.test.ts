import { afterEach, describe, expect, it, vi } from "vitest"
import { stashInvitationToken, takeInvitationToken } from "./pending-invitation"

const KEY = "tf-pending-invitation"

describe("pending-invitation", () => {
  afterEach(() => {
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it("ne stocke rien pour un token vide, null ou undefined", () => {
    stashInvitationToken(null)
    stashInvitationToken(undefined)
    stashInvitationToken("")

    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it("stocke un token, puis le rend UNE seule fois (usage unique)", () => {
    stashInvitationToken("tok-123")
    expect(window.sessionStorage.getItem(KEY)).toBe("tok-123")

    expect(takeInvitationToken()).toBe("tok-123")
    // effacé après lecture
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(takeInvitationToken()).toBeNull()
  })

  it("rend null quand rien n'est stocké", () => {
    expect(takeInvitationToken()).toBeNull()
  })

  it("avale l'erreur si le stockage échoue à l'écriture (navigation privée stricte)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded")
    })

    expect(() => stashInvitationToken("tok")).not.toThrow()
  })

  it("rend null si le stockage échoue à la lecture", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    expect(takeInvitationToken()).toBeNull()
  })
})
