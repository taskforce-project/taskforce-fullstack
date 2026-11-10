import type { IntegrationCatalog, McpServerStatus } from "@/lib/api/integration-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

/** Un connecteur de l'espace, tel que « Connectors » le montre (R122) : connecté, ou à reconnecter. */
export interface ConnectorLine {
  readonly key: string
  readonly name: string
  /** Un serveur MCP connecté que TaskForce ne joint plus : il faut le reconnecter. */
  readonly reconnect: boolean
}

type ConnectorTexts = (typeof CONSTANTS_EN)["rail"]["connectors"]

/** D'un regard (R141) : ce qui demande un geste d'abord, sinon ce qui est branché, en quelques noms. */
export function connectorsSummary(lines: readonly ConnectorLine[], t: ConnectorTexts): string {
  if (lines.length === 0) return t.none
  const toReconnect = lines.filter((line) => line.reconnect)
  if (toReconnect.length === 1) return fillText(t.reconnectOne, { name: toReconnect[0].name })
  if (toReconnect.length > 1) return fillText(t.reconnectMany, { count: toReconnect.length })
  if (lines.length === 1) return lines[0].name
  if (lines.length === 2) return fillText(t.two, { first: lines[0].name, second: lines[1].name })
  return fillText(t.more, { first: lines[0].name, second: lines[1].name, count: lines.length - 2 })
}

/** Les connecteurs connectés du catalogue, ceux à reconnecter d'abord, puis par nom. */
export function connectorLines(catalog: IntegrationCatalog, servers: readonly McpServerStatus[]): ConnectorLine[] {
  const unreachable = new Set(servers.filter((server) => !server.reachable).map((server) => server.connectorKey))
  return catalog.categories
    .flatMap((group) => group.tools)
    .filter((tool) => tool.connected)
    .map((tool) => ({ key: tool.key, name: tool.name, reconnect: unreachable.has(tool.key) }))
    .sort((a, b) => Number(b.reconnect) - Number(a.reconnect) || a.name.localeCompare(b.name))
}
