import { apiClient } from "@/lib/api/client"
import { TEAM_ROUTES } from "@/lib/config/api-routes"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TeamRole = "LEAD" | "MEMBER"

export interface TeamMember {
  id: number
  userId: number
  displayName: string
  initials: string
  avatarUrl: string | null
  role: TeamRole
  joinedAt: string
}

export interface Team {
  id: number
  name: string
  description: string | null
  emoji: string
  color: string
  members: TeamMember[]
  createdAt: string
  updatedAt: string
}

export interface CreateTeamPayload {
  name: string
  description?: string
  emoji?: string
  color?: string
}

export interface UpdateTeamPayload {
  name?: string
  description?: string
  emoji?: string
  color?: string
}

export interface AddTeamMemberPayload {
  userId: number
  role?: TeamRole
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const teamService = {
  async list(slug: string): Promise<Team[]> {
    const res = await apiClient.get<{ data: Team[] }>(TEAM_ROUTES.LIST(slug))
    return res.data.data
  },

  async get(slug: string, teamId: number): Promise<Team> {
    const res = await apiClient.get<{ data: Team }>(TEAM_ROUTES.BY_ID(slug, teamId))
    return res.data.data
  },

  async create(slug: string, payload: CreateTeamPayload): Promise<Team> {
    const res = await apiClient.post<{ data: Team }>(TEAM_ROUTES.CREATE(slug), payload)
    return res.data.data
  },

  async update(slug: string, teamId: number, payload: UpdateTeamPayload): Promise<Team> {
    const res = await apiClient.patch<{ data: Team }>(TEAM_ROUTES.UPDATE(slug, teamId), payload)
    return res.data.data
  },

  async delete(slug: string, teamId: number): Promise<void> {
    await apiClient.delete(TEAM_ROUTES.DELETE(slug, teamId))
  },

  async listMembers(slug: string, teamId: number): Promise<TeamMember[]> {
    const res = await apiClient.get<{ data: TeamMember[] }>(TEAM_ROUTES.MEMBERS(slug, teamId))
    return res.data.data
  },

  async addMember(slug: string, teamId: number, payload: AddTeamMemberPayload): Promise<TeamMember> {
    const res = await apiClient.post<{ data: TeamMember }>(TEAM_ROUTES.ADD_MEMBER(slug, teamId), payload)
    return res.data.data
  },

  async removeMember(slug: string, teamId: number, userId: number): Promise<void> {
    await apiClient.delete(TEAM_ROUTES.REMOVE_MEMBER(slug, teamId, userId))
  },
}
