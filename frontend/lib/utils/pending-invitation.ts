/**
 * Report d'un token d'invitation à travers l'authentification.
 *
 * Le lien d'invitation mène à `/auth/login?invitation=…` ou `/auth/register?invitation=…`. Le token
 * doit survivre à un parcours multi-étapes (inscription → OTP → login) et surtout au détour OAuth
 * (redirection vers Keycloak puis retour sur `/auth/callback`, qui PERD les paramètres d'URL). On le
 * met donc de côté dès qu'on le voit, pour tenter une acceptation explicite une fois authentifié.
 *
 * `sessionStorage` (et non `localStorage`) : la portée est l'onglet et la session - un token
 * d'invitation n'a pas à persister indéfiniment sur la machine.
 */
const KEY = "tf-pending-invitation"

export function stashInvitationToken(token: string | null | undefined): void {
  if (!token || typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(KEY, token)
  } catch {
    /* stockage indisponible (navigation privée stricte) - l'acceptation via le lien reste possible */
  }
}

/** Lit ET efface le token mis de côté (usage unique). */
export function takeInvitationToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    const token = window.sessionStorage.getItem(KEY)
    if (token) window.sessionStorage.removeItem(KEY)
    return token
  } catch {
    return null
  }
}
