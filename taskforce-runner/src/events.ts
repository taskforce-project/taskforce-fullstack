import { setTimeout as sleep } from "node:timers/promises";

import { ApiError, type RunnerEvent } from "./api.js";
import { log } from "./log.js";

/** Un refus que renvoyer ne changera pas (un lot mal formé) : le lot est laissé, et le dossier en marquera le trou. */
function refusedForGood(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);
}

/**
 * Relais de la chronologie d'un run vers TaskForce (OSS-5.3) et vers son dossier de preuve : les événements partent par
 * lots, dans l'ordre, au plus toutes les {@link EventRelayOptions.flushMs} ms. Un échec d'envoi n'arrête jamais l'agent.
 *
 * Un trou se voit (TF-J2-7) : chaque événement porte son numéro, 1, 2, 3... Un lot qui ne part pas reste en tête de la
 * file et repart plus tard, avant les suivants ; TaskForce ignore un numéro qu'il a déjà reçu (une réponse perdue) et
 * marque au dossier ceux qui ne sont jamais arrivés. À la fin, le résultat dit combien d'événements ont été numérotés
 * ({@link EventRelay.count}) : ceux qui manquent encore se marquent aussi.
 */
export interface EventSink {
  events(runId: number, events: RunnerEvent[]): Promise<void>;
}

export interface EventRelayOptions {
  flushMs: number;
  maxBatch: number;
  /**
   * Plafond par run, aligné sur celui du dossier de preuve du serveur. Atteint, un dernier événement `limit` le dit :
   * rien ne disparaît sans trace.
   */
  maxEvents: number;
  /** Attente avant de renvoyer un lot qui n'est pas parti ; elle double à chaque échec, jusqu'à 30 s. */
  retryMs: number;
  /** Envois tentés encore à la fin, avant de laisser au dossier la marque de ce qui n'est pas parti. */
  closeAttempts: number;
}

const DEFAULTS: EventRelayOptions = { flushMs: 2_000, maxBatch: 20, maxEvents: 10_000, retryMs: 1_000, closeAttempts: 3 };
const MAX_RETRY_MS = 30_000;

export class EventRelay {
  private queue: RunnerEvent[] = [];
  private next = 1;
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();
  private failures = 0;
  private warned = false;
  private closed = false;
  private readonly options: EventRelayOptions;

  constructor(private readonly sink: EventSink, private readonly runId: number, options: Partial<EventRelayOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Combien d'événements ont été numérotés : le résultat du run le dit à TaskForce. */
  get count(): number {
    return this.next - 1;
  }

  /** Ce qui attend encore de partir. */
  get pending(): number {
    return this.queue.length;
  }

  push(events: RunnerEvent[]): void {
    if (this.closed) return;
    for (const event of events) {
      if (this.next > this.options.maxEvents) return;
      const n = this.next++;
      this.queue.push(n === this.options.maxEvents
        ? { kind: "limit", text: `The runner sent ${this.options.maxEvents} events for this run: later ones are not sent.`, n }
        : { ...event, n });
    }
    if (this.queue.length >= this.options.maxBatch) {
      void this.flush();
    } else if (this.queue.length > 0 && !this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.options.flushMs);
    }
  }

  /**
   * Envoie ce qui attend, à la suite des envois précédents (l'ordre de la chronologie est celui de l'agent). Un lot qui
   * ne part pas reste en tête et repart plus tard ; la promesse se résout quand même : l'agent n'attend jamais TaskForce.
   */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.chain = this.chain.then(() => this.drain());
    return this.chain;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.slice(0, this.options.maxBatch);
      try {
        await this.sink.events(this.runId, batch);
        this.queue.splice(0, batch.length);
        this.failures = 0;
      } catch (e) {
        if (refusedForGood(e)) {
          this.queue.splice(0, batch.length);
          log.warn(`TaskForce refused ${batch.length} events of run #${this.runId} (${(e as Error).message}): the evidence will show the gap.`);
          continue;
        }
        this.failures++;
        if (!this.warned) log.warn(`Live timeline not sent to TaskForce, it will be sent again: ${(e as Error).message}`);
        this.warned = true;
        this.retryLater();
        return;
      }
    }
  }

  private retryLater(): void {
    if (this.closed || this.timer) return;
    const wait = Math.min(MAX_RETRY_MS, this.options.retryMs * 2 ** Math.max(0, this.failures - 1));
    this.timer = setTimeout(() => void this.flush(), wait);
    this.timer.unref?.();
  }

  /**
   * Dernier envoi, à la fin du run : quelques tentatives, puis la file s'arrête. Ce qui n'est pas parti manquera au
   * dossier, qui le marque d'après {@link count}.
   */
  async close(): Promise<void> {
    for (let attempt = 0; attempt < this.options.closeAttempts; attempt++) {
      await this.flush();
      if (this.queue.length === 0) break;
      await sleep(this.options.retryMs * (attempt + 1));
    }
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length > 0) {
      log.warn(`${this.queue.length} events of run #${this.runId} could not be sent: the evidence will show the gap.`);
    }
  }
}
