"use client"

import { useMemo } from "react"
import { useParams, useRouter } from "next/navigation"

import {
  closeIssueHref, issueHref, missionPath, previousAddress, sameAddress, withConversation, type IssueRef,
} from "@/lib/window/address"
import { boardPath, homePath, waitingPath } from "@/lib/window/pane"

/** L'adresse de maintenant, lue au moment du geste : le volet, et ce que sa requête ouvre (l'issue, la conversation). */
function here(): { pathname: string; search: string } {
  return { pathname: globalThis.location?.pathname ?? "", search: globalThis.location?.search ?? "" }
}

export interface PaneNavigation {
  /** Ouvre une issue dans le volet, par-dessus l'écran qui la liste, sinon par-dessus son tableau (R120). */
  openIssue: (issue: IssueRef) => void
  /** Ramène le volet à l'écran sous l'issue, tel qu'il était ; par l'historique quand il vient de là. */
  closeIssue: () => void
  /** Ouvre la vue du travail d'une mission. */
  openMission: (runId: number) => void
  /** Ouvre le tableau d'un projet. */
  openBoard: (projectId: number) => void
  /** Ouvre « Waiting for you » dans le volet (R127). */
  openWaiting: () => void
  /** Ferme le volet : l'accueil de l'espace, où la conversation est seule. */
  closePane: () => void
}

/**
 * Les gestes qui changent le volet (R120, séance n°18) : chacun pousse une adresse, et la conversation de la fenêtre
 * (`?c=`) la suit ; rien ne remonte en haut de l'écran. Fermer une issue revient en arrière dans l'historique quand
 * l'entrée d'avant est l'écran qu'elle recouvre : le bouton retour et la flèche du volet disent la même chose.
 */
export function usePaneNavigation(): PaneNavigation {
  const router = useRouter()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  return useMemo<PaneNavigation>(() => {
    const go = (href: string) => router.push(href, { scroll: false })
    return {
      openIssue: (issue) => {
        const { pathname, search } = here()
        go(issueHref(pathname, search, slug, issue))
      },
      closeIssue: () => {
        const { pathname, search } = here()
        const under = closeIssueHref(pathname, search)
        const previous = previousAddress()
        if (previous !== null && sameAddress(previous, under)) router.back()
        else go(under)
      },
      openMission: (runId) => go(withConversation(missionPath(slug, runId), here().search)),
      openBoard: (projectId) => go(withConversation(boardPath(slug, projectId), here().search)),
      openWaiting: () => go(withConversation(waitingPath(slug), here().search)),
      closePane: () => go(withConversation(homePath(slug), here().search)),
    }
  }, [router, slug])
}
