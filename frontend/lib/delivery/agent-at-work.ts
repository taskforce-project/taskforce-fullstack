import type { DeliveryRun } from "@/lib/api/delivery-service";

// ---------------------------------------------------------------------------
// Pendant une mission, l'issue montre l'agent qui y travaille au nom de la personne qui l'a déléguée (« Claude Code,
// for Pierre »), tant que la mission court ou que son résultat attend d'être relu. L'assigné gardé ne change pas : la
// recette du 01/11/2026 voyait « Unassigned » pendant que Claude Code travaillait.
// ---------------------------------------------------------------------------

interface Agent {
  key: string;
  displayName: string;
}

/**
 * « Claude Code, for Pierre » pendant la mission, « Claude Code » sans délégant connu ; null quand aucun agent n'y
 * travaille (pas de mission, mission en échec, résultat appliqué, écarté ou relancé). `template` : « {agent}, for {who} ».
 * `fallback` : le nom de l'agent quand la liste des agents n'est pas encore là.
 */
export function agentAtWork(
  run: DeliveryRun | null | undefined,
  agents: readonly Agent[],
  template: string,
  fallback: (providerKey: string) => string,
): string | null {
  if (!run) return null;
  const working = run.status === "QUEUED" || run.status === "RUNNING" || (run.status === "DONE" && !run.outcome);
  if (!working) return null;
  const agent = agents.find((a) => a.key === run.providerKey)?.displayName ?? fallback(run.providerKey);
  const who = run.startedByName?.trim();
  return who ? template.replace("{agent}", agent).replace("{who}", who) : agent;
}
