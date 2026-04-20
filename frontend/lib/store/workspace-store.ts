import { create } from "zustand";
import type {
  Workspace,
  WorkspaceMember,
  UpdateWorkspacePayload,
  CreateWorkspacePayload,
  InviteMemberPayload,
  UpdateMemberRolePayload,
} from "../api/workspace-service";
import {
  listWorkspaces,
  createWorkspace as createWorkspaceApi,
  getWorkspaceBySlug,
  updateWorkspace,
  getWorkspaceMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "../api/workspace-service";

interface WorkspaceState {
  /** Liste de tous les workspaces de l'utilisateur */
  workspaces: Workspace[];
  /** Workspace actuellement actif (déterminé par le slug dans l'URL) */
  activeWorkspace: Workspace | null;
  members: WorkspaceMember[];
  isLoading: boolean;
  membersLoading: boolean;

  /** Charge tous les workspaces de l'utilisateur */
  fetchWorkspaces: () => Promise<Workspace[]>;

  /** Charge un workspace par son slug et le définit comme actif */
  setActiveBySlug: (slug: string) => Promise<Workspace | null>;

  /** Crée un nouveau workspace */
  createWorkspace: (payload: CreateWorkspacePayload) => Promise<Workspace | null>;

  /** Met à jour les infos du workspace actif */
  updateWorkspaceInfo: (payload: UpdateWorkspacePayload) => Promise<Workspace | null>;

  /** Charge la liste des membres du workspace actif */
  fetchMembers: () => Promise<WorkspaceMember[]>;

  /** Invite un membre par email */
  invite: (payload: InviteMemberPayload) => Promise<WorkspaceMember | null>;

  /** Change le rôle d'un membre */
  changeRole: (memberId: number, payload: UpdateMemberRolePayload) => Promise<WorkspaceMember | null>;

  /** Retire un membre */
  kick: (memberId: number) => Promise<void>;

  clearWorkspace: () => void;

  // Rétrocompatibilité
  workspace: Workspace | null;
  fetchWorkspace: () => Promise<Workspace | null>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  workspace: null, // alias pour activeWorkspace (rétrocompatibilité)
  members: [],
  isLoading: false,
  membersLoading: false,

  clearWorkspace: () => set({ workspaces: [], activeWorkspace: null, workspace: null, members: [] }),

  fetchWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const workspaces = await listWorkspaces();
      set({ workspaces, isLoading: false });
      return workspaces;
    } catch {
      set({ isLoading: false });
      return [];
    }
  },

  setActiveBySlug: async (slug: string) => {
    // D'abord chercher dans le cache local
    const cached = get().workspaces.find((w) => w.slug === slug);
    if (cached) {
      set({ activeWorkspace: cached, workspace: cached });
      return cached;
    }
    // Sinon charger depuis l'API
    set({ isLoading: true });
    try {
      const workspace = await getWorkspaceBySlug(slug);
      set((state) => ({
        activeWorkspace: workspace,
        workspace: workspace,
        workspaces: state.workspaces.some((w) => w.slug === slug)
          ? state.workspaces.map((w) => (w.slug === slug ? workspace : w))
          : [...state.workspaces, workspace],
        isLoading: false,
      }));
      return workspace;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  createWorkspace: async (payload) => {
    try {
      const workspace = await createWorkspaceApi(payload);
      set((state) => ({ workspaces: [...state.workspaces, workspace] }));
      return workspace;
    } catch {
      return null;
    }
  },

  updateWorkspaceInfo: async (payload) => {
    const slug = get().activeWorkspace?.slug;
    if (!slug) return null;
    set({ isLoading: true });
    try {
      const workspace = await updateWorkspace(slug, payload);
      set((state) => ({
        activeWorkspace: workspace,
        workspace: workspace,
        workspaces: state.workspaces.map((w) => (w.slug === slug ? workspace : w)),
        isLoading: false,
      }));
      return workspace;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  fetchMembers: async () => {
    const slug = get().activeWorkspace?.slug;
    if (!slug) return [];
    set({ membersLoading: true });
    try {
      const members = await getWorkspaceMembers(slug);
      set({ members, membersLoading: false });
      return members;
    } catch {
      set({ membersLoading: false });
      return [];
    }
  },

  invite: async (payload) => {
    const slug = get().activeWorkspace?.slug;
    if (!slug) return null;
    try {
      const member = await inviteMember(slug, payload);
      set((state) => ({ members: [...state.members, member] }));
      return member;
    } catch {
      return null;
    }
  },

  changeRole: async (memberId, payload) => {
    const slug = get().activeWorkspace?.slug;
    if (!slug) return null;
    try {
      const updated = await updateMemberRole(slug, memberId, payload);
      set((state) => ({
        members: state.members.map((m) => (m.id === memberId ? updated : m)),
      }));
      return updated;
    } catch {
      return null;
    }
  },

  kick: async (memberId) => {
    const slug = get().activeWorkspace?.slug;
    if (!slug) return;
    await removeMember(slug, memberId);
    set((state) => ({
      members: state.members.filter((m) => m.id !== memberId),
    }));
  },

  // Rétrocompatibilité
  fetchWorkspace: async () => {
    const workspaces = await get().fetchWorkspaces();
    const first = workspaces[0] ?? null;
    if (first) set({ activeWorkspace: first, workspace: first });
    return first;
  },
}));


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
