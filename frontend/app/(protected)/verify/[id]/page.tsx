"use client"

import { useParams } from "next/navigation"

import { VerificationLink } from "@/components/delivery/verification-link"

/**
 * Le lien du témoin d'un dossier (R159, second tour de #551, M-b) : `/verify/{id}`, l'identifiant opaque que le serveur
 * écrit dans la pull request de la mission. Il ouvre la page de vérification de la mission, pour qui peut lire son dossier.
 */
export default function VerifyLinkPage() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : ""
  return <VerificationLink key={id} id={id} />
}
