import { describe, expect, it } from "vitest"

import type { AiStatus } from "@/lib/api/ai-status-service"
import type { Project } from "@/lib/api/project-service"
import { cortexModel, modelPlace, projectInView } from "./environment"

function status(patch: Partial<AiStatus> = {}): AiStatus {
  return {
    configured: true, chatAvailable: true, chatModel: "qwen3:14b", fastModel: "qwen3:8b", embeddingsAvailable: true,
    embeddingModel: "nomic-embed-text", contextWindow: 32_768, fastContextWindow: 16_384, ...patch,
  }
}

const project = (id: number) => ({ id, name: `Project ${id}` }) as Project

/** « Environment » (R122) : où tourne le modèle, et le projet en vue. */
describe("l'environnement de la conversation", () => {
  it.each([
    [null, true, "none"],
    [status({ configured: false }), true, "none"],
    [status(), false, "taskforce"],
    [status({ contextWindow: null }), false, "taskforce"],
    [status(), true, "here"],
    [status({ contextWindow: null }), true, "provider"],
  ])("le modèle de %o (app desktop : %s) tourne : %s", (ai, desktop, place) => {
    expect(modelPlace(ai, desktop)).toBe(place)
  })

  it.each([
    [status(), "qwen3:8b"],
    [status({ fastModel: null }), "qwen3:14b"],
    [status({ fastModel: null, chatModel: null }), null],
    [null, null],
  ])("le modèle de Cortex de %o : %s", (ai, model) => {
    expect(cortexModel(ai)).toBe(model)
  })

  it.each([
    ["/acme/projects/2/list", { projectId: 1 }, 2],
    ["/acme", { projectId: 1 }, 1],
    ["/acme/dashboard", undefined, null],
    ["/acme/projects/9", undefined, null],
    ["/acme", { projectId: null }, null],
  ])("le projet en vue sur %s : %s", (pathname, conversation, id) => {
    expect(projectInView(pathname, conversation, [project(1), project(2)])?.id ?? null).toBe(id)
  })
})
