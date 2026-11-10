"use client"

import { useEffect, useMemo } from "react"

import { catalogForThisApp } from "@/components/integrations/integrations-catalog"
import { IS_DESKTOP } from "@/lib/desktop"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { connectorLines, type ConnectorLine } from "@/lib/window/connectors"

/** Les connecteurs connectés de l'espace, lus quand `active` : le menu « + » les montre à son ouverture (R134). */
export function useConnectorLines(slug: string, active: boolean): ConnectorLine[] {
  const texts = usePreferencesStore((s) => s.t.integrations)
  const connectors = useIntegrationStore((s) => s.connectors)
  const fetchConnectors = useIntegrationStore((s) => s.fetchConnectors)
  const desktopGitHub = useDesktopToolsStore((s) => s.status?.github ?? null)
  const refreshDesktopTools = useDesktopToolsStore((s) => s.refresh)

  useEffect(() => {
    if (active && slug) void fetchConnectors(slug)
  }, [active, slug, fetchConnectors])

  // App desktop : GitHub est connecté quand le GitHub CLI de la personne l'est, comme dans le catalogue.
  useEffect(() => {
    if (active && IS_DESKTOP && useDesktopToolsStore.getState().status === null) void refreshDesktopTools()
  }, [active, refreshDesktopTools])

  return useMemo(() => {
    if (!connectors) return []
    return connectorLines(catalogForThisApp(connectors.catalog, texts, IS_DESKTOP, desktopGitHub), connectors.servers)
  }, [connectors, texts, desktopGitHub])
}
