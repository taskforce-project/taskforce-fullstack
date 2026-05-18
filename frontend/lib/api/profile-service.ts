import apiClient from "./api-client";
import { PROFILE_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileStats {
  issuesCreated:   number;
  issuesClosed:    number;
  cyclesCompleted: number;
  daysActive:      number;
  teammateCount:   number;
}

export interface ActivityEntry {
  id:              number;
  type:            string;
  issueTitle:      string;
  issueIdentifier: string;
  projectName:     string;
  createdAt:       string;
}

export interface HeatmapEntry {
  date:  string;   // "yyyy-MM-dd"
  count: number;
}

export interface ProfileData {
  stats:    ProfileStats;
  activity: ActivityEntry[];
  heatmap:  HeatmapEntry[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function getProfile(slug: string): Promise<ProfileData> {
  const response = await apiClient.get<{ data: ProfileData }>(PROFILE_ROUTES.GET(slug));
  return response.data.data;
}
