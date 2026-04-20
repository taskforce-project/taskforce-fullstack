/**
 * Retourne l'URL effective de l'avatar pour un utilisateur.
 * - Si l'utilisateur a défini un avatar custom (URL http ou data:) → on l'utilise
 * - Sinon → API route interne qui génère un SVG gradient avec les initiales
 */
export function getAvatarUrl({
  firstName,
  lastName,
  email,
  avatarUrl,
}: {
  firstName: string
  lastName: string
  email: string
  avatarUrl?: string | null
}): string {
  if (avatarUrl) return avatarUrl

  const initials = encodeURIComponent(
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?"
  )
  const seed = encodeURIComponent(email.toLowerCase())
  return `/api/avatar?initials=${initials}&seed=${seed}`
}
