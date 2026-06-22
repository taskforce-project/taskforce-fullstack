/**
 * Service pour les profils de compétences des membres (alimente Smart Assign).
 * Routes: /api/workspaces/{slug}/skills · /api/workspaces/{slug}/members/{userId}/skills
 */

import { apiClient } from "./client";
import { SKILL_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Seniority = "JUNIOR" | "MID" | "SENIOR" | "LEAD";

export interface MemberSkillProfile {
  userId: number;
  skills: string[];
  profileText: string | null;
  /** Capacité déclarée en heures/semaine (PROD-1.8 Phase 2), null si non renseignée */
  capacityHoursPerWeek: number | null;
  /** Séniorité, null si non renseignée */
  seniority: Seniority | null;
  /** Membre volontairement « en développement » (PROD-1.8 Phase 3 Inc C) */
  growthEnabled: boolean;
  /** Compétences cibles de montée en compétence */
  growthTargetSkills: string[];
  /** ISO-8601, null si aucun profil enregistré */
  updatedAt: string | null;
}

export interface UpsertSkillsPayload {
  skills: string[];
  profileText?: string | null;
  capacityHoursPerWeek?: number | null;
  seniority?: Seniority | null;
  growthEnabled?: boolean;
  growthTargetSkills?: string[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listSkillProfiles(slug: string): Promise<MemberSkillProfile[]> {
  const res = await apiClient.get<{ data: MemberSkillProfile[] }>(SKILL_ROUTES.LIST(slug));
  return res.data.data;
}

export async function getMemberSkills(slug: string, userId: number): Promise<MemberSkillProfile> {
  const res = await apiClient.get<{ data: MemberSkillProfile }>(SKILL_ROUTES.MEMBER(slug, userId));
  return res.data.data;
}

export async function updateMemberSkills(
  slug: string,
  userId: number,
  payload: UpsertSkillsPayload
): Promise<MemberSkillProfile> {
  const res = await apiClient.put<{ data: MemberSkillProfile }>(
    SKILL_ROUTES.MEMBER(slug, userId),
    payload
  );
  return res.data.data;
}
