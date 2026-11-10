"use client"

import { useParams } from "next/navigation"

import { WorkView } from "@/components/layout/work-view"

/**
 * La vue du travail d'une mission (R95, point 3 ; R120) : `/{slug}/missions/{runId}`, un volet de la fenêtre, à côté de
 * la conversation. On y arrive depuis « Missions » (la zone de droite), le pouls de la mission sur son issue, la barre
 * de gauche, et la ligne du haut quand une mission lancée depuis la conversation tourne.
 */
export default function MissionPage() {
  const params = useParams()
  const raw = typeof params?.runId === "string" ? params.runId : ""
  const runId = /^\d+$/.test(raw) ? Number(raw) : null
  return runId === null ? null : <WorkView key={runId} runId={runId} />
}
