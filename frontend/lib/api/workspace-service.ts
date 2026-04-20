/**
 * Service pour les opérations sur les workspaces.
 * Utilise les endpoints GET/PATCH /api/workspaces/* du backend.
 */

import { apiClient } from "./client";
import { WORKSPACE_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  ownerId: number;
  ownerName: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: number;
  userId: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface UpdateWorkspacePayload {
  name?: string;
  description?: string;
  logoUrl?: string;
}

export interface InviteMemberPayload {
  email: string;
}

export interface UpdateMemberRolePayload {
  role: WorkspaceRole;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Récupère le workspace de l'utilisateur connecté */
export async function getCurrentWorkspace(): Promise<Workspace> {
  const response = await apiClient.get<{ data: Workspace }>(WORKSPACE_ROUTES.CURRENT);
  return response.data.data;
}

/** Met à jour les infos du workspace (nom, description, logo) */
export async function updateWorkspace(payload: UpdateWorkspacePayload): Promise<Workspace> {
  const response = await apiClient.patch<{ data: Workspace }>(WORKSPACE_ROUTES.CURRENT, payload);
  return response.data.data;
}

/** Liste les membres du workspace */
export async function getWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const response = await apiClient.get<{ data: WorkspaceMember[] }>(WORKSPACE_ROUTES.MEMBERS);
  return response.data.data;
}

/** Invite un utilisateur existant par email */
export async function inviteMember(payload: InviteMemberPayload): Promise<WorkspaceMember> {
  const response = await apiClient.post<{ data: WorkspaceMember }>(WORKSPACE_ROUTES.INVITE, payload);
  return response.data.data;
}

/** Change le rôle d'un membre */
export async function updateMemberRole(
  memberId: number,
  payload: UpdateMemberRolePayload
): Promise<WorkspaceMember> {
  const response = await apiClient.patch<{ data: WorkspaceMember }>(
    WORKSPACE_ROUTES.MEMBER_ROLE(memberId),
    payload
  );
  return response.data.data;
}

/** Retire un membre du workspace */
export async function removeMember(memberId: number): Promise<void> {
  await apiClient.delete(WORKSPACE_ROUTES.MEMBER(memberId));
}
