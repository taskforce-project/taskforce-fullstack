/**
 * Service pour les opérations sur les workspaces.
 */

import { apiClient } from "./client";
import { WORKSPACE_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export interface Workspace {
  id: number;
  uuid: string;
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

export interface CreateWorkspacePayload {
  name: string;
  description?: string;
}

export interface InviteMemberPayload {
  email: string;
  role?: WorkspaceRole;
}

export interface UpdateMemberRolePayload {
  role: WorkspaceRole;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Liste tous les workspaces de l'utilisateur connecté */
export async function listWorkspaces(): Promise<Workspace[]> {
  const response = await apiClient.get<{ data: Workspace[] }>(WORKSPACE_ROUTES.LIST);
  return response.data.data;
}

/** Crée un nouveau workspace */
export async function createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace> {
  const response = await apiClient.post<{ data: Workspace }>(WORKSPACE_ROUTES.CREATE, payload);
  return response.data.data;
}

/** Récupère un workspace par son slug */
export async function getWorkspaceBySlug(slug: string): Promise<Workspace> {
  const response = await apiClient.get<{ data: Workspace }>(WORKSPACE_ROUTES.BY_SLUG(slug));
  return response.data.data;
}

/** Met à jour les infos d'un workspace */
export async function updateWorkspace(slug: string, payload: UpdateWorkspacePayload): Promise<Workspace> {
  const response = await apiClient.patch<{ data: Workspace }>(WORKSPACE_ROUTES.BY_SLUG(slug), payload);
  return response.data.data;
}

/** Liste les membres d'un workspace */
export async function getWorkspaceMembers(slug: string): Promise<WorkspaceMember[]> {
  const response = await apiClient.get<{ data: WorkspaceMember[] }>(WORKSPACE_ROUTES.MEMBERS(slug));
  return response.data.data;
}

/** Invite un utilisateur existant par email */
export async function inviteMember(slug: string, payload: InviteMemberPayload): Promise<WorkspaceMember> {
  const response = await apiClient.post<{ data: WorkspaceMember }>(WORKSPACE_ROUTES.INVITE(slug), payload);
  return response.data.data;
}

/** Change le rôle d'un membre */
export async function updateMemberRole(
  slug: string,
  memberId: number,
  payload: UpdateMemberRolePayload
): Promise<WorkspaceMember> {
  const response = await apiClient.patch<{ data: WorkspaceMember }>(
    WORKSPACE_ROUTES.MEMBER_ROLE(slug, memberId),
    payload
  );
  return response.data.data;
}

/** Retire un membre du workspace */
export async function removeMember(slug: string, memberId: number): Promise<void> {
  await apiClient.delete(WORKSPACE_ROUTES.MEMBER(slug, memberId));
}

/** Rétrocompatibilité — récupère le workspace courant (owner lookup) */
export async function getCurrentWorkspace(): Promise<Workspace> {
  const response = await apiClient.get<{ data: Workspace }>(WORKSPACE_ROUTES.CURRENT);
  return response.data.data;
}

