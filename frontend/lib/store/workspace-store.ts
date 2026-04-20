import { create } from "zustand";
import type { Workspace, WorkspaceMember, UpdateWorkspacePayload, InviteMemberPayload, UpdateMemberRolePayload } from "../api/workspace-service";
import {
  getCurrentWorkspace,
  updateWorkspace,
  getWorkspaceMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "../api/workspace-service";

interface WorkspaceState {
  workspace: Workspace | null;
  members: WorkspaceMember[];
  isLoading: boolean;
  membersLoading: boolean;

  /** Charge le workspace courant depuis le backend */
  fetchWorkspace: () => Promise<Workspace | null>;

  /** Met à jour les infos du workspace */
  updateWorkspaceInfo: (payload: UpdateWorkspacePayload) => Promise<Workspace | null>;

  /** Charge la liste des membres */
  fetchMembers: () => Promise<WorkspaceMember[]>;

  /** Invite un membre par email */
  invite: (payload: InviteMemberPayload) => Promise<WorkspaceMember | null>;

  /** Change le rôle d'un membre */
  changeRole: (memberId: number, payload: UpdateMemberRolePayload) => Promise<WorkspaceMember | null>;

  /** Retire un membre */
  kick: (memberId: number) => Promise<void>;

  setWorkspace: (workspace: Workspace | null) => void;
  clearWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  members: [],
  isLoading: false,
  membersLoading: false,

  setWorkspace: (workspace) => set({ workspace }),
  clearWorkspace: () => set({ workspace: null, members: [] }),

  fetchWorkspace: async () => {
    set({ isLoading: true });
    try {
      const workspace = await getCurrentWorkspace();
      set({ workspace, isLoading: false });
      return workspace;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  updateWorkspaceInfo: async (payload) => {
    set({ isLoading: true });
    try {
      const workspace = await updateWorkspace(payload);
      set({ workspace, isLoading: false });
      return workspace;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  fetchMembers: async () => {
    set({ membersLoading: true });
    try {
      const members = await getWorkspaceMembers();
      set({ members, membersLoading: false });
      return members;
    } catch {
      set({ membersLoading: false });
      return [];
    }
  },

  invite: async (payload) => {
    try {
      const member = await inviteMember(payload);
      set((state) => ({ members: [...state.members, member] }));
      return member;
    } catch {
      return null;
    }
  },

  changeRole: async (memberId, payload) => {
    try {
      const updated = await updateMemberRole(memberId, payload);
      set((state) => ({
        members: state.members.map((m) => (m.id === memberId ? updated : m)),
      }));
      return updated;
    } catch {
      return null;
    }
  },

  kick: async (memberId) => {
    await removeMember(memberId);
    set((state) => ({
      members: state.members.filter((m) => m.id !== memberId),
    }));
  },
}));
