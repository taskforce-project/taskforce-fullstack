import { AxiosError, AxiosHeaders } from "axios"
import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { failureOf, failureSentence, failureStep } from "./connect-failure"

const t = CONSTANTS_EN.connect

/** Une réponse d'erreur de l'API, telle qu'axios la rend. */
function answered(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null,
    { status, statusText: "", headers: {}, config, data })
}

describe("failureOf : la raison que le serveur donne, jamais son texte pour décider (R160)", () => {
  it("reads the stable reason code, and keeps the server's own words apart", () => {
    const refused = answered(400, { status: 400, error: "CONNECT_REGISTRATION_REFUSED",
      message: "OAuth DCR https://auth.example/register : HTTP 400 (invalid_redirect_uri)" })

    expect(failureOf(refused, "jira")).toEqual({ key: "jira", kind: "CONNECT_REGISTRATION_REFUSED",
      raw: "OAuth DCR https://auth.example/register : HTTP 400 (invalid_redirect_uri)" })
  })

  it("an unknown code, a missing role, no answer, and a plain error each have their kind", () => {
    expect(failureOf(answered(400, { error: "BUSINESS_ERROR", message: "Required field: mcpUrl" }), "x"))
      .toEqual({ key: "x", kind: "unknown", raw: "Required field: mcpUrl" })
    expect(failureOf(answered(403, { error: "Forbidden", message: "Access denied" }), "x").kind).toBe("forbidden")
    expect(failureOf(answered(500, undefined), "x")).toEqual({ key: "x", kind: "unknown", raw: "Request failed" })
    expect(failureOf(new AxiosError("Network Error", "ERR_NETWORK"), "x")).toEqual({ key: "x", kind: "network", raw: "Network Error" })
    expect(failureOf(new Error("boom"), "x")).toEqual({ key: "x", kind: "unknown", raw: "boom" })
    expect(failureOf("nothing", "x")).toEqual({ key: "x", kind: "unknown", raw: null })
  })
})

describe("failureSentence et failureStep : ce qui s'est passé, quoi faire, puis où ça s'est arrêté", () => {
  it("says the cause in words before any Try again, never a code or a URL", () => {
    const sentence = failureSentence({ kind: "CONNECT_REGISTRATION_REFUSED" }, "Jira", t)

    expect(sentence).toBe("Jira refused to register TaskForce, so its sign-in couldn't open. "
      + "Ask your Jira admin whether outside apps may connect, or connect with a key.")
    expect(sentence).not.toMatch(/CONNECT_|https?:|invalid_/)
    expect(failureStep({ kind: "CONNECT_REGISTRATION_REFUSED" }, "Jira", t)).toBe("Where it stopped: registering TaskForce with Jira.")
  })

  it("every reason has a sentence and a step", () => {
    for (const kind of Object.keys(t.failures) as (keyof typeof t.failures)[]) {
      expect(failureSentence({ kind }, "Notion", t)).not.toContain("{")
      expect(failureStep({ kind }, "Notion", t)).toMatch(/^Where it stopped: .+\.$/)
    }
  })
})
