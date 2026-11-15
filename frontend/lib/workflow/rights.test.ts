import { describe, expect, it } from "vitest"

import type { ProjectMember } from "@/lib/api/project-service"
import { canWriteProject } from "@/lib/workflow/rights"

const member = (userId: number, role: ProjectMember["role"]) => ({ userId, role } as ProjectMember)

/** Le droit d'écrire dans un projet, la règle du serveur sur ce que la fenêtre sait (R159, L6). */
describe("canWriteProject", () => {
  it("a read-only member can't write; a lead or a member can", () => {
    const project = { isPublic: true, members: [member(7, "VIEWER"), member(8, "MEMBER"), member(9, "LEAD")] }
    expect(canWriteProject(project, "7", [])).toBe(false)
    expect(canWriteProject(project, 8, [])).toBe(true)
    expect(canWriteProject(project, "9", [])).toBe(true)
  })

  it("a workspace owner or admin writes, even listed as read-only", () => {
    const project = { isPublic: false, members: [member(7, "VIEWER")] }
    expect(canWriteProject(project, "7", [{ userId: 7, role: "ADMIN" }])).toBe(true)
    expect(canWriteProject(project, "7", [{ userId: 7, role: "OWNER" }])).toBe(true)
    expect(canWriteProject(project, "7", [{ userId: 7, role: "MEMBER" }])).toBe(false)
  })

  it("outside the members: a public project yes, a private one no", () => {
    expect(canWriteProject({ isPublic: true, members: [member(8, "LEAD")] }, "7", [])).toBe(true)
    expect(canWriteProject({ isPublic: false, members: [member(8, "LEAD")] }, "7", [])).toBe(false)
  })

  it("without the project or its members, the gesture stays offered: the server judges", () => {
    expect(canWriteProject(undefined, "7", [])).toBe(true)
    expect(canWriteProject({ isPublic: false, members: [] }, "7", [])).toBe(true)
    expect(canWriteProject({ isPublic: false, members: [member(8, "LEAD")] }, null, [])).toBe(true)
  })
})
