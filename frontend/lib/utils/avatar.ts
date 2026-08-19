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

/**
 * Initiales déterministes pour le fallback d'avatar (1 à 2 lettres, majuscules).
 * Priorité : nom affiché → prénom/nom → partie locale de l'email.
 */
export function getInitials({
  email,
  name,
  firstName,
  lastName,
}: {
  email?: string | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
}): string {
  if (firstName || lastName) {
    return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?"
  }

  const source = (name ?? email ?? "").trim()
  if (!source) return "?"

  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return source.slice(0, 2).toUpperCase()
}
