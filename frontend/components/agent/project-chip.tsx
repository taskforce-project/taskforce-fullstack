"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { Check, ChevronDown, FolderKanban } from "lucide-react"

import { RowMenuItem, RowMenuSeparator, RowMenu } from "@/components/agent/row-menu"
import { screenFrom } from "@/lib/cortex/screen"
import { fillText } from "@/lib/delivery/result-card"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useScreenStore } from "@/lib/store/screen-store"

/**
 * Où travaille la conversation (R135, séance n°20), dans la rangée sous la boîte : le projet se voit, et se change d'un clic,
 * « No project » compris. Une conversation neuve prend celui du volet ouvert, tant qu'elle n'a pas commencé ; ensuite il ne
 * change plus quand la personne va ailleurs : c'est elle qui décide, l'écran ne fait que renseigner Cortex.
 */
export function ProjectChip({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.composer)
  const pathname = usePathname()
  const openIssue = useScreenStore((s) => s.openIssue)
  const project = useCortexStore((s) => s.project)
  const pinned = useCortexStore((s) => s.projectPinned)
  const followPane = useCortexStore((s) => s.followPane)
  const chooseProject = useCortexStore((s) => s.chooseProject)
  const setNotice = useCortexStore((s) => s.setNotice)
  const projects = useProjectStore((s) => s.projects)
  const paneProject = screenFrom(pathname, openIssue)?.projectId ?? null

  useEffect(() => {
    followPane(paneProject)
  }, [paneProject, pinned, project, followPane])

  const current = projects.find((candidate) => candidate.id === project)
  const name = current?.name ?? t.noProject
  const label = fillText(t.projectLabel, { project: name })
  const open = projects.filter((candidate) => candidate.status !== "ARCHIVED")

  const choose = async (next: number | null) => {
    if (next === project) return
    if (!(await chooseProject(slug, next))) setNotice(t.projectNotSaved)
  }

  return (
    <RowMenu
      label={label}
      menuLabel={t.projectMenu}
      trigger={
        <>
          <FolderKanban className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{name}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </>
      }
    >
      <RowMenuItem onSelect={() => void choose(null)}>
        <span className="min-w-0 flex-1 truncate">{t.noProject}</span>
        {project === null && <Check className="size-4 shrink-0" aria-hidden="true" />}
      </RowMenuItem>
      {open.length > 0 && <RowMenuSeparator />}
      {open.map((candidate) => (
        <RowMenuItem key={candidate.id} onSelect={() => void choose(candidate.id)}>
          <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
          {candidate.id === project && <Check className="size-4 shrink-0" aria-hidden="true" />}
        </RowMenuItem>
      ))}
    </RowMenu>
  )
}
