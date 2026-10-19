/**
 * Passkeys de la personne connectée (réglages de sécurité) : options de création, enregistrement, liste, retrait. La
 * connexion par passkey passe par {@link authService} (elle ouvre la session comme le mot de passe).
 */

import { apiClient } from "./client";
import { PASSKEY_ROUTES } from "../config/api-routes";

/** Passkey du compte, telle que les réglages la montrent : jamais de clé. */
export interface Passkey {
  id: string;
  label: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** Options de création d'une passkey, à passer au navigateur. */
export async function passkeyRegistrationOptions(): Promise<Record<string, unknown>> {
  const res = await apiClient.post<{ data: Record<string, unknown> }>(PASSKEY_ROUTES.OPTIONS);
  return res.data.data;
}

/** Enregistre la passkey que le navigateur vient de créer. */
export async function registerPasskey(label: string | null, credential: Record<string, unknown>): Promise<Passkey> {
  const res = await apiClient.post<{ data: Passkey }>(PASSKEY_ROUTES.PASSKEYS, { label, credential });
  return res.data.data;
}

/** Passkeys du compte. Appel de fond (ouverture des réglages) : jamais de toast. */
export async function listPasskeys(): Promise<Passkey[]> {
  const res = await apiClient.get<{ data: Passkey[] }>(PASSKEY_ROUTES.PASSKEYS, { silentError: true });
  return res.data.data ?? [];
}

/** Retire cette passkey : elle ne permet plus de se connecter, même si l'appareil la garde. */
export async function removePasskey(passkeyId: string): Promise<void> {
  await apiClient.delete(PASSKEY_ROUTES.PASSKEY(passkeyId));
}
