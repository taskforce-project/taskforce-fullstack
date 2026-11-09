"use client"

import { useCallback, useEffect, useState } from "react"

import type { IssueCommentHit, IssueHit } from "@/lib/api/issue-service"
import type { NoteHit } from "@/lib/api/note-service"
import { SEARCH_DELAY_MS } from "@/lib/hooks/use-pick-options"
import { searchKey, useSearchStore } from "@/lib/store/search-store"

/**
 * Le temps qu'on attend tout le serveur avant de montrer ce qui est là : au-delà, un appel lent ne gèle plus la liste.
 * En deçà, les sections changent toutes en même temps : rien ne saute, et aucun indicateur ne clignote.
 */
export const SETTLE_MS = 450

const NO_ISSUES: readonly IssueHit[] = []
const NO_COMMENTS: readonly IssueCommentHit[] = []
const NO_NOTES: readonly NoteHit[] = []

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

export interface PaletteSearch {
  /** Ce qui est écrit dans le champ. */
  query: string
  change: (next: string) => void
  /** Ce qui est tapé, sans les blancs autour. */
  typed: string
  /** Le texte dont la liste montre les résultats : celui d'avant, tant que le serveur n'a pas répondu au nouveau. */
  shown: string
  issues: readonly IssueHit[]
  comments: readonly IssueCommentHit[]
  notes: readonly NoteHit[]
  /** La dernière recherche n'a pas abouti : la liste le dit. */
  failed: boolean
}

/**
 * La recherche de Ctrl+K (R141) : une recherche par pause (`SEARCH_DELAY_MS`), pas par touche ; la liste garde ce qu'elle
 * montre jusqu'à la réponse, puis change d'un coup. Sans texte, les issues les dernières changées. Une recherche déjà
 * faite se montre tout de suite, et se relit derrière.
 */
export function usePaletteSearch(slug: string, open: boolean): PaletteSearch {
  const find = useSearchStore((s) => s.find)
  const findInside = useSearchStore((s) => s.findInside)
  const [query, setQuery] = useState("")
  const [settled, setSettled] = useState("")
  const [failedOn, setFailedOn] = useState<string | null>(null)
  const typed = query.trim()

  const typedKey = searchKey(slug, typed)
  const known = useSearchStore((s) => typed !== "" && s.hits[typedKey] !== undefined && s.comments[typedKey] !== undefined && s.notes[typedKey] !== undefined)
  const shown = typed === "" ? "" : known ? typed : settled
  const shownKey = searchKey(slug, shown)
  const issues = useSearchStore((s) => s.hits[shownKey]) ?? NO_ISSUES
  const comments = useSearchStore((s) => (shown ? s.comments[shownKey] : undefined)) ?? NO_COMMENTS
  const notes = useSearchStore((s) => (shown ? s.notes[shownKey] : undefined)) ?? NO_NOTES

  // Les dernières changées sont lues avant la première ouverture, et relues à chacune : la section est déjà là, rien ne saute.
  useEffect(() => {
    if (slug && !typed) void find(slug, "")
  }, [slug, open, typed, find])

  useEffect(() => {
    if (!open || !slug || !typed) return
    let live = true
    const id = setTimeout(() => {
      const answered = Promise.all([find(slug, typed), findInside(slug, typed)]).then(([found, inside]) => {
        if (live) setFailedOn(found === null || !inside ? typed : null)
      })
      void Promise.race([answered, wait(SETTLE_MS)]).then(() => { if (live) setSettled(typed) })
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [open, slug, typed, find, findInside])

  const change = useCallback((next: string) => {
    setQuery(next)
    if (!next.trim()) {
      setSettled("")
      setFailedOn(null)
    }
  }, [])

  return { query, change, typed, shown, issues, comments, notes, failed: failedOn !== null && failedOn === typed }
}
