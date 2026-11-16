import type { Project } from "@/lib/api/project-service"
import type { WorkspaceMember } from "@/lib/api/workspace-service"

/**
 * La personne peut-elle écrire dans le projet (déplacer une issue, la confier à un agent) ? La règle du serveur
 * (`ProjectVisibilityGuard.canWrite`), sur ce que la fenêtre sait : un propriétaire ou un administrateur de l'espace, un
 * membre du projet qui n'est pas en lecture seule (VIEWER), ou, hors des membres, toute personne de l'espace pour un projet
 * public. Sans le projet ni ses membres, on ne sait pas : le geste reste offert, et le serveur juge comme toujours. De même
 * tant que la liste des membres de l'espace n'est pas lue (vide : elle compte au moins la personne une fois lue) : la
 * personne y est peut-être propriétaire ou administratrice, qui écrit partout (R159, N4).
 */
export function canWriteProject(
  project: Pick<Project, "isPublic" | "members"> | null | undefined,
  me: string | number | null | undefined,
  workspaceMembers: readonly Pick<WorkspaceMember, "userId" | "role">[],
): boolean {
  if (me === null || me === undefined) return true
  const id = String(me)
  if (workspaceMembers.some((member) => String(member.userId) === id && (member.role === "OWNER" || member.role === "ADMIN"))) {
    return true
  }
  if (!project || !Array.isArray(project.members) || project.members.length === 0) return true
  const unread = workspaceMembers.length === 0
  const member = project.members.find((m) => String(m.userId) === id)
  if (member) return member.role !== "VIEWER" || unread
  return project.isPublic || unread
}
