/**
 * Retourne l'URL de l'avatar pour un utilisateur.
 * - Si `avatarUrl` est défini en DB → l'utilise directement (cached par le navigateur).
 * - Sinon → génère l'URL DiceBear identicon basée sur l'email (déterministe, sans requête backend).
 *
 * À utiliser partout dans l'app pour garantir la cohérence des PDPs.
 */
function resolveApiAvatarUrl(avatarUrl: string): string {
  if (/^(https?:)?\/\//.test(avatarUrl) || avatarUrl.startsWith("data:")) {
    return avatarUrl
  }

  const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "")
  const normalizedPath = avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`
  return `${apiBaseUrl}${normalizedPath}`
}

export function getAvatarUrl({
  email,
  avatarUrl,
}: {
  email: string
  avatarUrl?: string | null
  firstName?: string
  lastName?: string
}): string {
  if (avatarUrl) return resolveApiAvatarUrl(avatarUrl)
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(email)}`
}
