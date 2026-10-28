import type { RunnerEvent } from "./api.js";
import { log } from "./log.js";

/**
 * Relais de la chronologie d'un run vers TaskForce (OSS-5.3) : les événements partent par lots, dans l'ordre, au
 * plus toutes les {@link EventRelayOptions.flushMs} ms. Un échec d'envoi n'arrête jamais l'agent : la chronologie
 * est un confort de suivi, le résultat du run passe par son propre appel.
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
}

const DEFAULTS: EventRelayOptions = { flushMs: 2_000, maxBatch: 20, maxEvents: 10_000 };

export class EventRelay {
  private queue: RunnerEvent[] = [];
  private accepted = 0;
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();
  private warned = false;
  private readonly options: EventRelayOptions;

  constructor(private readonly sink: EventSink, private readonly runId: number, options: Partial<EventRelayOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  push(events: RunnerEvent[]): void {
    for (const event of events) {
      if (this.accepted >= this.options.maxEvents) return;
      this.accepted++;
      this.queue.push(this.accepted === this.options.maxEvents
        ? { kind: "limit", text: `The runner sent ${this.options.maxEvents} events for this run: later ones are not sent.` }
        : event);
    }
    if (this.queue.length >= this.options.maxBatch) {
      this.flush();
    } else if (this.queue.length > 0 && !this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.flushMs);
    }
  }

  /** Envoie ce qui attend, à la suite des envois précédents (l'ordre de la chronologie est celui de l'agent). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.options.maxBatch);
      this.chain = this.chain.then(() => this.sink.events(this.runId, batch)).catch((e: unknown) => {
        if (!this.warned) log.warn(`Live timeline not sent to TaskForce: ${(e as Error).message}`);
        this.warned = true;
      });
    }
    return this.chain;
  }

  /** Dernier envoi, à la fin du run. */
  close(): Promise<void> {
    return this.flush();
  }
}
