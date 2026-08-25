/**
 * Statut opérationnel — santé RÉELLE des services, lue de l'actuator Spring via /api/status.
 */

import { apiClient } from "./client";
import { STATUS_ROUTES } from "../config/api-routes";

export interface SystemComponent {
  /** Clé de l'indicateur actuator (db, redis, diskSpace, mail…). */
  key: string;
  /** Code d'état : UP | DOWN | OUT_OF_SERVICE | UNKNOWN. */
  status: string;
}

export interface SystemStatus {
  /** État global agrégé. */
  status: string;
  components: SystemComponent[];
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const res = await apiClient.get<{ data: SystemStatus }>(STATUS_ROUTES.SYSTEM);
  return res.data.data;
}
