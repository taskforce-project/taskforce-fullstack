import { apiClient } from "@/lib/api/client"
import { WORKSPACE_ROUTES, INVITATION_ROUTES } from "@/lib/config/api-routes"
import type { WorkspaceRole } from "@/lib/api/workspace-service"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED"

export interface Invitation {
  id: number
  email: string
  role: WorkspaceRole
  status: InvitationStatus
  invitedByName: string | null
  expiresAt: string
  createdAt: string
}

export interface InvitationPreview {
  email: string | null
  workspaceName: string | null
  role: WorkspaceRole | null
  valid: boolean
  accountExists: boolean
}

export interface CreateInvitationPayload {
  email: string
  role?: WorkspaceRole
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/** Crée une invitation par email (compte ou non). Admin/Owner uniquement. */
export async function createInvitation(slug: string, payload: CreateInvitationPayload): Promise<Invitation> {
  const res = await apiClient.post<{ data: Invitation }>(WORKSPACE_ROUTES.INVITATIONS(slug), payload)
  return res.data.data
}

/** Liste les invitations en attente du workspace. */
export async function listPendingInvitations(slug: string): Promise<Invitation[]> {
  const res = await apiClient.get<{ data: Invitation[] }>(WORKSPACE_ROUTES.INVITATIONS(slug))
  return res.data.data
}

/** Annule une invitation en attente. */
export async function revokeInvitation(slug: string, invitationId: number): Promise<void> {
  await apiClient.delete(WORKSPACE_ROUTES.INVITATION(slug, invitationId))
}

/** Résout un token d'invitation (public) pour pré-remplir l'inscription. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const res = await apiClient.get<{ data: InvitationPreview }>(INVITATION_ROUTES.PREVIEW(token))
  return res.data.data
}

/** Accepte une invitation pour l'utilisateur authentifié (email doit matcher). */
export async function acceptInvitation(token: string): Promise<void> {
  await apiClient.post(INVITATION_ROUTES.ACCEPT(token), {})
}
