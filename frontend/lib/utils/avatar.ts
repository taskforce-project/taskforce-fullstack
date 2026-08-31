import { createAvatar } from "@dicebear/core"
import { identicon } from "@dicebear/collection"

/**
 * Retourne l'URL de l'avatar pour un utilisateur.
 * - Si `avatarUrl` est défini en DB (photo OAuth GitHub/Google, ou fichier importé) → l'utilise.
 * - Sinon → génère un identicon DiceBear **déterministe** (seed = email), rendu localement.
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

/**
 * Cache déterministe (même seed → même SVG). Évite de régénérer l'identicon à chaque rendu - listes
 * de membres, sidebar, sélecteurs - alors que le résultat est stable pour un email donné.
 */
const generatedCache = new Map<string, string>()

/**
 * Avatar de repli généré **dans le navigateur** (DiceBear identicon), renvoyé en data-URI.
 *
 * Historiquement ce repli pointait vers `https://api.dicebear.com/9.x/identicon/svg?seed=…`. En
 * production, la CSP `img-src` n'autorise que des origines explicites (le joker `https:` n'existe
 * qu'en développement) : cet appel externe était donc **bloqué**, l'image cassait, et la personne se
 * retrouvait « sans photo de profil ». On génère désormais le même identicon localement (paquet
 * `@dicebear/core`, déjà en dépendance) : aucune requête réseau, `data:` est déjà autorisé par la
 * CSP, et le rendu reste déterministe (identique partout pour un même email).
 */
function generatedAvatar(seed: string): string {
  const cached = generatedCache.get(seed)
  if (cached) return cached

  const dataUri = createAvatar(identicon, { seed }).toDataUri()
  generatedCache.set(seed, dataUri)
  return dataUri
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
  return generatedAvatar(email)
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
