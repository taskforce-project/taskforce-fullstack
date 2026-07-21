import { create } from "zustand"
import {
  teamService,
  type Team,
  type TeamMember,
  type CreateTeamPayload,
  type UpdateTeamPayload,
  type AddTeamMemberPayload,
} from "@/lib/api/team-service"

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface TeamStore {
  teams: Team[]
  loading: boolean
  error: string | null

  fetchTeams: (slug: string) => Promise<void>
  createTeam: (slug: string, payload: CreateTeamPayload) => Promise<Team>
  updateTeam: (slug: string, teamId: number, payload: UpdateTeamPayload) => Promise<void>
  deleteTeam: (slug: string, teamId: number) => Promise<void>
  addMember: (slug: string, teamId: number, payload: AddTeamMemberPayload) => Promise<TeamMember>
  removeMember: (slug: string, teamId: number, userId: number) => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useTeamStore = create<TeamStore>((set) => ({
  teams: [],
  loading: false,
  error: null,

  fetchTeams: async (slug) => {
    set({ loading: true, error: null })
    try {
      const teams = await teamService.list(slug)
      set({ teams, loading: false })
    } catch {
      set({ loading: false, error: "Impossible de charger les équipes" })
    }
  },

  createTeam: async (slug, payload) => {
    const team = await teamService.create(slug, payload)
    set((state) => ({ teams: [team, ...state.teams] }))
    return team
  },

  updateTeam: async (slug, teamId, payload) => {
    const updated = await teamService.update(slug, teamId, payload)
    set((state) => ({
      teams: state.teams.map((t) => (t.id === teamId ? updated : t)),
    }))
  },

  deleteTeam: async (slug, teamId) => {
    await teamService.delete(slug, teamId)
    set((state) => ({ teams: state.teams.filter((t) => t.id !== teamId) }))
  },

  addMember: async (slug, teamId, payload) => {
    const member = await teamService.addMember(slug, teamId, payload)
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id === teamId ? { ...t, members: [...t.members, member] } : t
      ),
    }))
    return member
  },

  removeMember: async (slug, teamId, userId) => {
    await teamService.removeMember(slug, teamId, userId)
    set((state) => {
      const filterMember = (m: TeamMember) => m.userId !== userId
      return {
        teams: state.teams.map((t) =>
          t.id === teamId ? { ...t, members: t.members.filter(filterMember) } : t
        ),
      }
    })
  },
}))
