/**
 * Service pour l'envoi de retours utilisateur (« Give feedback »).
 */

import { apiClient } from "./client";
import { FEEDBACK_ROUTES } from "../config/api-routes";

export type FeedbackCategory = "BUG" | "IDEA" | "OTHER";

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  /** Page / fonctionnalité d'origine (ex. « Labs · Intelligence »). */
  context?: string;
}

/** Envoie un retour (persisté côté back + notif email best-effort à l'équipe). */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<void> {
  await apiClient.post(FEEDBACK_ROUTES.SUBMIT, input);
}
