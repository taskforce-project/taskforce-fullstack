import { create } from "zustand";
import {
  getMemberSkills,
  updateMemberSkills,
  type MemberSkillProfile,
  type UpsertSkillsPayload,
} from "../api/skill-service";

interface SkillState {
  /** Profils de compétences indexés par userId */
  profilesByUser: Record<number, MemberSkillProfile>;

  fetchMemberSkills: (slug: string, userId: number) => Promise<MemberSkillProfile>;
  saveMemberSkills: (slug: string, userId: number, payload: UpsertSkillsPayload) => Promise<MemberSkillProfile>;
}

export const useSkillStore = create<SkillState>((set) => ({
  profilesByUser: {},

  fetchMemberSkills: async (slug, userId) => {
    const profile = await getMemberSkills(slug, userId);
    set((s) => ({ profilesByUser: { ...s.profilesByUser, [userId]: profile } }));
    return profile;
  },

  saveMemberSkills: async (slug, userId, payload) => {
    const profile = await updateMemberSkills(slug, userId, payload);
    set((s) => ({ profilesByUser: { ...s.profilesByUser, [userId]: profile } }));
    return profile;
  },
}));
