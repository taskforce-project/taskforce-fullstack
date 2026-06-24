"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

/**
 * La page Teams globale a été retirée (QA2-21) : les équipes se gèrent désormais
 * par opération (onglet Members d'un projet → « Équipes associées », avec création).
 * On redirige les anciens liens vers la page Members du workspace.
 */
export default function TeamsPage() {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  useEffect(() => {
    router.replace(slug ? `/${slug}/members` : "/")
  }, [slug, router])

  return null
}
