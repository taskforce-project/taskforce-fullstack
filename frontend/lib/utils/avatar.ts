/**
 * Retourne l'URL de l'avatar pour un utilisateur.
 * - Si `avatarUrl` est défini en DB → l'utilise directement (cached par le navigateur).
 * - Sinon → génère l'URL DiceBear identicon basée sur l'email (déterministe, sans requête backend).
 *
 * À utiliser partout dans l'app pour garantir la cohérence des PDPs.
 */
export function getAvatarUrl({
  email,
  avatarUrl,
}: {
  email: string
  avatarUrl?: string | null
  firstName?: string
  lastName?: string
}): string {
  if (avatarUrl) return avatarUrl
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(email)}`
}
