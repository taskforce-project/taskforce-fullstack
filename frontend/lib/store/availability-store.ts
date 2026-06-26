import { create } from "zustand";
import {
  listLeaves,
  createLeave,
  deleteLeave,
  type MemberLeave,
  type CreateLeavePayload,
} from "../api/availability-service";

interface AvailabilityState {
  /** Indisponibilités indexées par userId */
  leavesByUser: Record<number, MemberLeave[]>;

  fetchLeaves: (slug: string, userId: number) => Promise<MemberLeave[]>;
  addLeave: (slug: string, userId: number, payload: CreateLeavePayload) => Promise<MemberLeave>;
  removeLeave: (slug: string, userId: number, leaveId: number) => Promise<void>;
}

/** Tri décroissant par date de début. */
function sortLeaves(leaves: MemberLeave[]): MemberLeave[] {
  return [...leaves].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export const useAvailabilityStore = create<AvailabilityState>((set) => ({
  leavesByUser: {},

  fetchLeaves: async (slug, userId) => {
    const leaves = sortLeaves(await listLeaves(slug, userId));
    set((s) => ({ leavesByUser: { ...s.leavesByUser, [userId]: leaves } }));
    return leaves;
  },

  addLeave: async (slug, userId, payload) => {
    const leave = await createLeave(slug, userId, payload);
    set((s) => ({
      leavesByUser: {
        ...s.leavesByUser,
        [userId]: sortLeaves([...(s.leavesByUser[userId] ?? []), leave]),
      },
    }));
    return leave;
  },

  removeLeave: async (slug, userId, leaveId) => {
    await deleteLeave(slug, userId, leaveId);
    set((s) => ({
      leavesByUser: {
        ...s.leavesByUser,
        [userId]: (s.leavesByUser[userId] ?? []).filter((l) => l.id !== leaveId),
      },
    }));
  },
}));
