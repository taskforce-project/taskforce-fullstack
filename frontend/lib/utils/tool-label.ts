/**
 * Le nom d'un outil d'un serveur MCP tel que la personne le lit (R133 : pas de nom technique au premier regard) :
 * `list_issues` devient « List issues », `notion-search` « Search », `getJiraIssue` « Get Jira issue ». Le préfixe du
 * serveur (`notion-`, `slack_`) tombe quand il répète le nom de l'outil connecté, qui garde sa casse ailleurs.
 */
export function toolLabel(name: string, connectorName = ""): string {
  const brand = connectorName.trim()
  let words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
  if (brand && words.length > 1 && words[0].toLowerCase() === brand.toLowerCase()) words = words.slice(1)
  const text = words
    .map((word) => (brand && word.toLowerCase() === brand.toLowerCase() ? brand : word.toLowerCase()))
    .join(" ")
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : name
}
