import { describe, expect, it } from "vitest"
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios"

import { AI_TIMEOUT_MS } from "@/lib/api/client"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { failureText } from "./failed-turn"

const t = CONSTANTS_EN.thread

function httpError(status: number, data: Record<string, unknown> = {}): AxiosError {
  const response = { status, data, headers: {}, statusText: "", config: {} } as AxiosResponse
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", {} as InternalAxiosRequestConfig, undefined, response)
}

const TOO_LONG = "This message is too long: TaskForce takes 400,000 characters at most. Shorten it, or split it in two."

/** R133, TF-J1-15 : ce qui s'est passé et quoi faire, depuis la vraie cause. « Sorry, I couldn't answer » ne survit pas. */
describe("failureText", () => {
  it.each([
    ["une taille refusée dit la limite", httpError(400, { message: "Invalid input data", validationErrors: { message: [TOO_LONG] } }), TOO_LONG],
    ["un autre champ refusé le dit", httpError(400, { message: "Invalid input data", validationErrors: { model: ["size must be between 0 and 128"] } }), "size must be between 0 and 128"],
    ["un refus sans détail ne montre pas le mot général", httpError(400, { message: "Invalid input data" }), t.failServer],
    ["le serveur dit ce qui ne va pas", httpError(404, { message: "Conversation not found" }), "Conversation not found"],
    ["le frein de débit dit sa limite", httpError(429, { error: "AI Rate Limited", message: "Too many AI requests: wait 40 s." }), "Too many AI requests: wait 40 s."],
    ["une panne du serveur", httpError(500, {}), t.failServer],
    ["une passerelle tombée", httpError(502, { message: "Bad gateway" }), t.failServer],
    ["aucune réponse du réseau", new AxiosError("Network Error", "ERR_NETWORK"), t.failNetwork],
    ["une erreur qui n'est pas du réseau", new Error("boom"), t.failNetwork],
  ])("%s", (_, error, expected) => {
    expect(failureText(error, t)).toBe(expected)
  })

  it("le délai dépassé dit combien de temps, et propose un modèle plus petit", () => {
    const said = failureText(new AxiosError("timeout of 200000ms exceeded", "ECONNABORTED"), t)

    expect(said).toContain(`${AI_TIMEOUT_MS / 1000} seconds`)
    expect(said).toContain("smaller model")
  })

  it("jamais la phrase d'avant", () => {
    for (const error of [httpError(500), httpError(400), new Error("x")]) {
      expect(failureText(error, t)).not.toContain("couldn't answer")
    }
  })
})
