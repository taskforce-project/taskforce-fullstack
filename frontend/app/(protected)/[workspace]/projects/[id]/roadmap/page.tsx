"use client"

import { useParams } from "next/navigation"
import { RoadmapGantt } from "@/components/roadmap/roadmap-gantt"

export default function ProjectRoadmapPage() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const projectId = Number(typeof params?.id === "string" ? params.id : "0")

  return <RoadmapGantt slug={slug} projectId={Number.isFinite(projectId) ? projectId : undefined} />
}
