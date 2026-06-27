"use client"

import { useParams } from "next/navigation"
import { RoadmapGantt } from "@/components/roadmap/roadmap-gantt"

export default function RoadmapPage() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  return <RoadmapGantt slug={slug} />
}
