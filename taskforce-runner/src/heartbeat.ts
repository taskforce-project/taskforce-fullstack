import { ApiError } from "./api.js";
import { log } from "./log.js";

/**
 * Le signe de vie d'une mission. Il dit aussi au runner que la mission s'est close sans lui : la personne l'a arrêtée dans
 * TaskForce (R138, séance n°20). Le serveur ne peut pas joindre le poste (ADR-013) : c'est son refus du signe de vie (le run
 * n'est plus tenu par ce runner) qui lève `closed`, et l'agent s'arrête. Toute autre erreur (réseau, jeton) n'est pas un
 * arrêt : la mission continue.
 */
export interface Heartbeat {
  readonly closed: AbortSignal;
  stop(): void;
}

export function startHeartbeat(api: { heartbeat(runId: number): Promise<void> }, runId: number, everyMs: number): Heartbeat {
  const closed = new AbortController();
  const timer = setInterval(() => {
    api.heartbeat(runId).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 403) {
        if (!closed.signal.aborted) log.info(`Run #${runId} ended in TaskForce: the agent stops.`);
        closed.abort();
        return;
      }
      log.warn(`Heartbeat refused: ${(e as Error).message}`);
    });
  }, everyMs);
  return { closed: closed.signal, stop: () => clearInterval(timer) };
}
