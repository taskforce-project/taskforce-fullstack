"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck, ShieldQuestion } from "lucide-react"

import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore } from "@/lib/store/notification-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useUserStore } from "@/lib/store/user-store"
import { arrivalSuggestions, waitingItems, type WaitingItem } from "@/lib/window/arrival"

const ROW =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"

/**
 * L'arrivée d'une nouvelle conversation (R123, séance n°18), qui remplace le tour guidé (R124) : jamais vide. D'abord ce
 * qui attend la personne (les demandes d'accord, les résultats à juger), chaque ligne ouvrant son issue dans le volet ;
 * puis trois suggestions tirées de l'état réel de l'espace, qui remplissent le compositeur sans rien envoyer. Rien à
 * suggérer : une ligne le dit.
 */
export function Arrival({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.conversation)
  const router = useRouter()
  const signals = useNotificationStore((s) => s.signals)
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const me = useUserStore((s) => s.user?.id)
  const projects = useProjectStore((s) => s.projects)
  const find = useSearchStore((s) => s.find)
  const recent = useSearchStore((s) => s.hits[searchKey(slug, "")])
  const setDraft = useCortexStore((s) => s.setDraft)
  const { openIssue } = usePaneNavigation()
  // Une recherche qui échoue ne laisse pas l'arrivée attendre : elle suggère avec les missions et les projets.
  const [failed, setFailed] = useState(false)
  const waitingId = useId()
  const suggestionsId = useId()

  // Les dernières issues changées, relues à chaque arrivée : les suggestions viennent de l'état de maintenant.
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void find(slug, "").then((found) => { if (!cancelled && found === null) setFailed(true) })
    return () => { cancelled = true }
  }, [slug, find])

  const waiting = useMemo(() => waitingItems(signals, runs, me, t), [signals, runs, me, t])
  const suggestions = useMemo(
    () => arrivalSuggestions({ issues: recent ?? [], runs, me, projects }, t),
    [recent, runs, me, projects, t],
  )
  const ready = recent !== undefined || failed

  const openItem = (item: WaitingItem) => {
    if (item.signalId && slug) void markAsRead(slug, item.signalId)
    if (item.issue) openIssue(item.issue)
    else if (item.href) router.push(item.href)
  }

  /** Une suggestion remplit le compositeur ; rien ne part tant que la personne n'envoie pas. */
  const suggest = (text: string) => {
    setDraft(text)
    document.getElementById("command-bar-input")?.focus()
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {waiting.length > 0 && (
        <section aria-labelledby={waitingId} className="flex flex-col gap-1">
          <h3 id={waitingId} className="px-2 text-xs font-medium text-muted-foreground">{t.waiting}</h3>
          <ul className="flex flex-col">
            {waiting.map((item) => {
              const Icon = item.kind === "approval" ? ShieldQuestion : CircleCheck
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => openItem(item)} className={ROW}>
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <section aria-labelledby={suggestionsId} className="flex flex-col gap-1.5">
        <h3 id={suggestionsId} className="px-2 text-xs font-medium text-muted-foreground">{t.suggestions}</h3>
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-1">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => suggest(s.text)}
                title={s.text}
                className="h-8 max-w-full truncate rounded-full border border-border px-3 text-sm text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : ready ? (
          <p className="px-2 text-sm text-muted-foreground">{t.nothingToSuggest}</p>
        ) : null}
      </section>
    </div>
  )
}
