"use client"

import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarUrl, getInitials } from "@/lib/utils/avatar"
import { cn } from "@/lib/utils"

export interface UserAvatarProps {
  /** Identité utilisée comme seed déterministe (DiceBear) — garantit la même PDP partout. */
  email?: string | null
  /** URL d'avatar persistée en DB ; sinon fallback DiceBear sur l'email. */
  avatarUrl?: string | null
  /** Nom affiché (alt + initiales). */
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  /** Classe sur la racine (taille : `size-8` par défaut via Avatar). */
  className?: string
  /** Classe sur le fallback (taille de police des initiales). */
  fallbackClassName?: string
  /** Classe sur l'image (ex: `object-cover` pour une photo uploadée). */
  imageClassName?: string
}

/**
 * Avatar utilisateur unifié de l'app.
 *
 * Source de vérité unique : `getAvatarUrl` (DiceBear identicon seedé sur l'email)
 * + `getInitials` en fallback. Remplace toute initiale colorée / seed ad-hoc afin
 * que la PDP d'un même utilisateur soit identique sur toutes les pages (PROD-3.8).
 */
export function UserAvatar({
  email,
  avatarUrl,
  name,
  firstName,
  lastName,
  className,
  fallbackClassName,
  imageClassName,
}: UserAvatarProps) {
  const seedEmail = email ?? ""
  const label = name ?? email ?? "Utilisateur"
  const initials = getInitials({ email, name, firstName, lastName })

  return (
    <Avatar className={className}>
      {seedEmail && (
        <AvatarImage
          src={getAvatarUrl({ email: seedEmail, avatarUrl })}
          alt={label}
          className={imageClassName}
        />
      )}
      <AvatarFallback className={cn("text-xs font-medium", fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
