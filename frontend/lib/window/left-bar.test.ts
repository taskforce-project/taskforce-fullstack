import { describe, expect, it } from "vitest"

import type { ConversationSummary } from "@/lib/api/ai-conversation-service"
import type { Project } from "@/lib/api/project-service"
import { groupConversations, leftBarProjects } from "./left-bar"

function project(id: number, patch: Partial<Project> = {}): Project {
  return {
    id, name: `Project ${id}`, identifier: `P${id}`, description: null, status: "ACTIVE", isPublic: true,
    isFavorite: false, workspaceId: 1, workspaceSlug: "acme", createdById: 7, createdByName: "Ada", memberCount: 1,
    totalIssues: 0, openIssues: 0, members: [], labels: [], iconUrl: null, color: "bg-shape-blue", growthMode: false,
    repoProvider: null, repoFullName: null, createdAt: "2026-11-01T10:00:00", updatedAt: "2026-11-01T10:00:00",
    ...patch,
  }
}

const talk = (id: number, projectId?: number | null): ConversationSummary => ({
  id, title: `Conversation ${id}`, updatedAt: null, messageCount: 2, totalTokens: 0, projectId,
})

/** La barre de gauche (R121) : le travail d'abord, chaque projet avec ses conversations, puis celles sans projet. */
describe("la barre de gauche", () => {
  it("montre les projets qui vivent, les favoris d'abord", () => {
    const projects = [project(1), project(2, { isFavorite: true }), project(3, { status: "ARCHIVED" }), project(4, { status: "PAUSED" })]

    expect(leftBarProjects(projects).map((p) => p.id)).toEqual([2, 1, 4])
  })

  it("range chaque conversation sous le projet où elle a commencé, les autres sans projet", () => {
    const shown = [project(1), project(2)]
    const conversations = [talk(10, 1), talk(11, null), talk(12, 2), talk(13, 1), talk(14), talk(15, 9)]

    const groups = groupConversations(conversations, shown)

    expect(groups.byProject.get(1)?.map((c) => c.id)).toEqual([10, 13])
    expect(groups.byProject.get(2)?.map((c) => c.id)).toEqual([12])
    // Sans projet, celle d'un serveur plus ancien (sans le champ), et celle d'un projet que la barre ne montre pas.
    expect(groups.loose.map((c) => c.id)).toEqual([11, 14, 15])
  })
})
