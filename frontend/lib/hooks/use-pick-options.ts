"use client"

import { useEffect, useMemo, useRef } from "react"

import type { IssueHit } from "@/lib/api/issue-service"
import {
  gestureOptions, mentionOptions, type PickGesture, type PickOption,
} from "@/lib/cortex/composer-picker"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/** Le temps de laisser finir un mot avant de chercher : une recherche par pause, pas par touche. */
export const SEARCH_DELAY_MS = 150

const NONE: readonly IssueHit[] = []

/**
 * Ce qu'une liste du compositeur propose (R123) : « mention » (après « @ ») les issues, les personnes et les projets ;
 * « attach » (le « + ») les issues et les projets ; « gesture » (après « / ») les gestes de Cortex. Les issues viennent
 * de la recherche de l'espace, lancée après une courte pause ; tant qu'elle cherche, la dernière trouvée reste. Null :
 * aucune liste.
 */
export function usePickOptions(
  slug: string,
  kind: "mention" | "attach" | "gesture" | null,
  query: string,
): { options: PickOption[]; searching: boolean } {
  const texts = usePreferencesStore((s) => s.t.conversation.gesture)
  const projects = useProjectStore((s) => s.projects)
  const members = useWorkspaceStore((s) => s.members)
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers)
  const find = useSearchStore((s) => s.find)
  const key = searchKey(slug, query)
  const found = useSearchStore((s) => s.hits[key])
  // Pendant qu'une recherche part, la liste garde la dernière trouvée : elle ne clignote pas à chaque touche.
  const latest = useSearchStore((s) => s.latest[slug])
  const searching = useSearchStore((s) => Boolean(s.pending[key]))
  const wantsIssues = kind === "mention" || kind === "attach"
  const askedMembers = useRef(false)

  useEffect(() => {
    if (!wantsIssues || !slug) return
    const id = setTimeout(() => { void find(slug, query) }, SEARCH_DELAY_MS)
    return () => clearTimeout(id)
  }, [wantsIssues, slug, query, find])

  // Les personnes ne se chargent qu'une fois, à la première mention.
  useEffect(() => {
    if (kind !== "mention" || members.length > 0 || askedMembers.current) return
    askedMembers.current = true
    void fetchMembers()
  }, [kind, members.length, fetchMembers])

  const gestures = useMemo<PickGesture[]>(
    () => Object.entries(texts).map(([id, gesture]) => ({ id, label: gesture.label, text: gesture.text })),
    [texts],
  )

  const issues = found ?? latest ?? NONE
  // Un projet archivé ne se joint pas : il ne se montre plus à gauche.
  const open = useMemo(() => projects.filter((project) => project.status !== "ARCHIVED"), [projects])
  const options = useMemo(() => {
    if (kind === "gesture") return gestureOptions(query, gestures)
    if (kind === "mention") return mentionOptions(query, { issues, people: members, projects: open })
    if (kind === "attach") return mentionOptions(query, { issues, people: [], projects: open })
    return []
  }, [kind, query, gestures, issues, members, open])

  return { options, searching: wantsIssues && searching }
}
