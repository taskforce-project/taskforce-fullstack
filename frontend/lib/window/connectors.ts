import type { IntegrationCatalog, McpServerStatus } from "@/lib/api/integration-service"

/** Un connecteur de l'espace, tel que « Connectors » le montre (R122) : connecté, ou à reconnecter. */
export interface ConnectorLine {
  readonly key: string
  readonly name: string
  /** Un serveur MCP connecté que TaskForce ne joint plus : il faut le reconnecter. */
  readonly reconnect: boolean
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
