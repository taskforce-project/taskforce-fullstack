"use client"

import { useEffect, useId, useMemo, useState } from "react"

import { WaitingRows } from "@/components/inbox/waiting-rows"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useUserStore } from "@/lib/store/user-store"
import { ARRIVAL_ROWS, arrivalSuggestions, waitingItems } from "@/lib/window/arrival"
import { waitingCount } from "@/lib/window/waiting"

/**
 * L'arrivée d'une nouvelle conversation (R123, séance n°18 ; R127, séance n°19), qui remplace le tour guidé (R124) :
 * jamais vide, et d'un regard. D'abord ce qui attend vraiment la personne, trois lignes au plus, chacune ouvrant son
 * issue dans le volet, puis « See all » et le total ; puis trois suggestions tirées de l'état réel de l'espace, qui
 * remplissent le compositeur sans rien envoyer. Rien à suggérer : une ligne le dit.
 */
export function Arrival({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.conversation)
  const approvals = useDeliveryStore((s) => s.openApprovals)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const me = useUserStore((s) => s.user?.id)
  const projects = useProjectStore((s) => s.projects)
  const find = useSearchStore((s) => s.find)
  const recent = useSearchStore((s) => s.hits[searchKey(slug, "")])
  const setDraft = useCortexStore((s) => s.setDraft)
  const { openWaiting } = usePaneNavigation()
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

  const waiting = useMemo(() => waitingItems(approvals, runs, me, t), [approvals, runs, me, t])
  const suggestions = useMemo(
    () => arrivalSuggestions({ issues: recent ?? [], runs, me, projects }, t),
    [recent, runs, me, projects, t],
  )
  const ready = recent !== undefined || failed
  const more = waiting.length > ARRIVAL_ROWS ? { total: waitingCount(approvals, runs, me), onOpen: openWaiting } : undefined

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
          <WaitingRows slug={slug} items={waiting.slice(0, ARRIVAL_ROWS)} more={more} />
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
