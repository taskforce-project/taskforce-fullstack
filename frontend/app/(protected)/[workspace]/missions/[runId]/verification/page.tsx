"use client"

import { useParams } from "next/navigation"

import { VerificationView } from "@/components/delivery/verification-view"

/**
 * La page de vérification d'une mission (R212) : `/{slug}/missions/{runId}/verification`, un volet de la fenêtre. On y
 * arrive depuis la preuve de la mission, et par le lien que le témoin écrit dans sa pull request (TF-J2-7).
 */
export default function VerificationPage() {
  const params = useParams()
  const raw = typeof params?.runId === "string" ? params.runId : ""
  const runId = /^\d+$/.test(raw) ? Number(raw) : null
  return runId === null ? null : <VerificationView key={runId} runId={runId} />
}
