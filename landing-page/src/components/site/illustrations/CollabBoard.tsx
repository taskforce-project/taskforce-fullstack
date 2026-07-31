import { MessageSquare, Plus } from "lucide-react";
import { Toast } from "../AppShot";
import { AppWindow, PersonChip } from "../scene/AppWindow";
import {
  BOARD,
  LABEL_STYLE,
  PRIORITY_DOT,
  PROJECT,
  WORKSPACE,
  type Card,
  type Column,
} from "@/lib/story";
import { cn } from "@/lib/utils";

/**
 * CollabBoard — le VRAI board TaskForce, cadré pour la page Collaboration.
 *
 * Il partage la fiction de `lib/story` avec le hero (mêmes colonnes, cartes, personnes) mais
 * raconte une autre chose : la SURFACE PARTAGÉE. D'où trois différences avec le board du hero :
 *   · un chip de **cycle** (les issues se rangent en cycles — `cycle-service`) ;
 *   · une pastille **« Live »** : le board reçoit les événements d'issues en temps réel
 *     (`use-project-realtime` → `/topic/projects.{id}`, upsert/remove du store) ;
 *   · des compteurs de **commentaires** sur les cartes (`Issue.commentCount` est un vrai champ)
 *     et deux toasts qui rejouent de VRAIS événements diffusés : un déplacement (`updated`)
 *     et une création (`created`).
 *
 * HONNÊTETÉ : pas d'indicateur de présence (« 3 en ligne », « untel édite »). Le backend ne
 * diffuse que des événements d'issues, pas de présence — donc on ne le montre pas. Ce qui bouge
 * ici bouge vraiment pour tout le monde dans l'app.
 *
 * Statique (SSR, aucun îlot) : rendu par Astro sans `client:*`, comme le hero.
 */

/** Commentaires par carte — `commentCount` est un champ réel de l'issue. Illustration. */
const COMMENTS: Record<string, number> = { "CP-12": 3, "CP-9": 5, "CP-6": 2 };

function BoardCard({ card }: { card: Card }) {
  const comments = COMMENTS[card.key];
  return (
    <article
      className={cn(
        "rounded-lg border bg-white p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        card.hero ? "border-primary/45 ring-primary/15 ring-1" : "border-[#e9e9ed]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[card.priority])} />
        <span className="text-muted-foreground font-mono text-[9.5px]">{card.key}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.35] text-foreground">{card.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1">
          {card.labels?.map((l) => (
            <span
              key={l}
              className={cn("rounded border px-1 py-px text-[8.5px] font-medium capitalize", LABEL_STYLE[l])}
            >
              {l}
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {comments != null && (
            <span className="text-muted-foreground flex items-center gap-0.5 text-[9.5px]">
              <MessageSquare className="size-2.5" strokeWidth={2} />
              {comments}
            </span>
          )}
          {card.assignee && <PersonChip person={card.assignee} withName={false} />}
        </span>
      </div>
    </article>
  );
}

function BoardColumn({ col }: { col: Column }) {
  return (
    <div className="flex w-[178px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span aria-hidden className={cn("size-2 rounded-[3px]", col.accent)} />
        <span className="text-[12px] font-medium text-foreground">{col.name}</span>
        <span className="text-muted-foreground text-[11px]">{col.count}</span>
      </div>
      <div className="flex flex-col gap-2">
        {col.cards.map((c) => (
          <BoardCard key={c.key} card={c} />
        ))}
      </div>
    </div>
  );
}

export function CollabBoard() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <AppWindow active="Operations" breadcrumb={[WORKSPACE.name, "Operations", PROJECT]} className="w-full">
        {/* Barre du board : projet + cycle, et l'état « Live » du temps réel. */}
        <div className="flex items-center gap-2.5 border-b border-[#f0f0f3] px-4 py-2.5">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{PROJECT}</span>
          <span className="text-muted-foreground rounded-md border px-1.5 py-[3px] text-[10.5px]">
            Cycle 8
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-[3px] text-[10.5px] font-medium text-emerald-700">
            <span aria-hidden className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>

        {/* Les colonnes — débordent à droite comme un vrai board. */}
        <div className="flex gap-3 overflow-hidden px-4 py-4">
          {BOARD.map((col) => (
            <BoardColumn key={col.id} col={col} />
          ))}
        </div>
      </AppWindow>

      {/* Toast 1 — un déplacement d'issue, diffusé en temps réel (événement `updated`). */}
      <Toast
        className="-top-3 right-3 sm:-right-4"
        icon={<span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-400" />}
      >
        <span className="font-medium">Léo</span> moved CP-9 → In progress
      </Toast>

      {/* Toast 2 — une création d'issue, diffusée de la même façon (événement `created`). */}
      <Toast
        className="bottom-10 left-3 sm:-left-4"
        icon={
          <span className="text-primary flex size-4 items-center justify-center rounded-full border">
            <Plus className="size-2.5" strokeWidth={2.5} />
          </span>
        }
      >
        <span className="font-medium">Sam</span> created CP-33 · now
      </Toast>
    </div>
  );
}
