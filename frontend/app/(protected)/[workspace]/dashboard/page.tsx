"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ChevronDown, Clock, RefreshCw } from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { useProjectStore } from "@/lib/store/project-store"
import { useDashboardCardsStore } from "@/lib/store/dashboard-cards-store"
import { useTourStore } from "@/lib/store/tour-store"
import { PageContainer } from "@/components/layout/page-shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DashboardHero } from "@/components/dashboard/dashboard-hero"
import { QuickColumns } from "@/components/dashboard/quick-columns"
import { DashboardGrid } from "@/components/dashboard/dashboard-grid"
import { AddCardDialog } from "@/components/dashboard/add-card-dialog"
import { GLOBAL_RANGES, rangeStorageKey, type GlobalRange } from "@/components/dashboard/card-registry"

/** Grille de squelettes pendant le premier chargement des cartes. */
function CardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[230px] rounded-xl" />
      ))}
    </div>
  )
}

/**
 * Dashboard façon Cloudflare : hero centré (pilule connecteurs + recherche Cmd+K),
 * trois colonnes de reprise (Opérations / Ma file / Récents), puis la section
 * Analytics — grille de cartes épinglées PERSISTÉES par utilisateur et par
 * workspace (API dashboard-cards), réordonnables et configurables.
 */
export default function DashboardPage() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const { user } = useAuth()
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  const cards = useDashboardCardsStore((s) => s.cards)
  const cardsLoading = useDashboardCardsStore((s) => s.isLoading)
  const cardsError = useDashboardCardsStore((s) => s.error)
  const fetchCards = useDashboardCardsStore((s) => s.fetchCards)

  // Période globale de la section Analytics — préférence UI par workspace (localStorage),
  // pas une donnée métier. Les cartes qui savent l'honorer l'utilisent comme fenêtre par défaut.
  const [globalRange, setGlobalRange] = useState<GlobalRange>("30d")
  // Incrémenté par le refresh global — propagé à toutes les cartes de la grille.
  const [refreshToken, setRefreshToken] = useState(0)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    if (!slug) return
    // Projets : source partagée des colonnes + cartes santé / à surveiller / kpi-open.
    void fetchProjects(slug)
    // Cartes épinglées : le premier GET bootstrape les 4 cartes par défaut côté serveur.
    void fetchCards(slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Relit la préférence de période au changement de workspace.
  useEffect(() => {
    if (!slug) return
    const stored = localStorage.getItem(rangeStorageKey(slug))
    if (stored === "24h" || stored === "7d" || stored === "30d") setGlobalRange(stored)
  }, [slug])

  const changeRange = (value: string) => {
    if (value !== "24h" && value !== "7d" && value !== "30d") return
    setGlobalRange(value)
    if (slug) localStorage.setItem(rangeStorageKey(slug), value)
  }

  // Tour produit : au 1ᵉʳ dashboard (jamais vu), on le lance après un court délai — le temps que la
  // grille se peigne pour que les cibles `data-tour` existent. `hasSeen` (persisté) évite tout
  // re-déclenchement. Rejeu depuis l'aide via `?tour=1` (forcé même si déjà vu), puis on nettoie l'URL.
  const tourHasSeen = useTourStore((s) => s.hasSeen)
  const tourActive = useTourStore((s) => s.isActive)
  const tourDismissed = useTourStore((s) => s.dismissed)
  const startTour = useTourStore((s) => s.start)
  useEffect(() => {
    if (tourActive || !slug) return
    const forceTour = new URLSearchParams(window.location.search).get("tour") === "1"
    // `hasSeen` (persisté) = terminé/opt-out définitif ; `dismissed` (session) = fermé sans cocher →
    // pas de re-déclenchement tant qu'on n'a pas rechargé l'app, mais la visite reviendra au prochain accès.
    if ((tourHasSeen || tourDismissed) && !forceTour) return
    const t = setTimeout(() => {
      startTour()
      if (forceTour) window.history.replaceState(null, "", `/${slug}/dashboard`)
    }, forceTour ? 300 : 900)
    return () => clearTimeout(t)
  }, [tourHasSeen, tourDismissed, tourActive, startTour, slug])

  const displayName = user?.displayName?.trim() || user?.firstName || ""
  const rangeLabel = GLOBAL_RANGES.find((r) => r.value === globalRange)?.label ?? globalRange

  return (
    <PageContainer>
      <DashboardHero displayName={displayName} />

      <QuickColumns slug={slug} />

      {/* Analytics — période globale + refresh global + grille de cartes persistées. */}
      <section className="space-y-3" data-tour="analytics">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Clock className="size-3.5 text-muted-foreground" />
                  {rangeLabel}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={globalRange} onValueChange={changeRange}>
                  {GLOBAL_RANGES.map((r) => (
                    <DropdownMenuRadioItem key={r.value} value={r.value} className="text-xs">
                      {r.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setRefreshToken((n) => n + 1)}
            >
              <RefreshCw className="size-3.5" /> Actualiser
            </Button>
          </div>
        </div>

        {cardsError && cards.length === 0 ? (
          // Jamais de spinner infini : message court + réessai.
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">Impossible de charger vos cartes.</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void fetchCards(slug)}>
              <RefreshCw className="size-3.5" /> Réessayer
            </Button>
          </div>
        ) : cardsLoading && cards.length === 0 ? (
          <CardsSkeleton />
        ) : (
          <DashboardGrid
            slug={slug}
            cards={cards}
            globalRange={globalRange}
            refreshToken={refreshToken}
            onAddCard={() => setAddOpen(true)}
          />
        )}
      </section>

      <AddCardDialog slug={slug} open={addOpen} onOpenChange={setAddOpen} />
    </PageContainer>
  )
}
