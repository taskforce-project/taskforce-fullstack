import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "../BrandLogo";
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
import { APP_URL } from "../nav";

/**
 * Preuve sociale HONNÊTE (review 6) : « Built with », pas « customers » — on n'a pas de
 * clients à montrer, mais on peut montrer l'écosystème sur lequel on construit. Vrais logos.
 */
const BUILT_WITH = [
  { key: "anthropic", label: "Claude" },
  { key: "cursor", label: "Cursor" },
  { key: "openai", label: "OpenAI" },
  { key: "ollama", label: "Ollama" },
  { key: "github", label: "GitHub" },
  { key: "linear", label: "Linear" },
];

/**
 * Hero — titre, promesse, CTA, et un **vrai board TaskForce** comme visuel produit.
 *
 * Décision user (phase design) : le hero montre le PRODUIT réel, pas un schéma. On rend donc la
 * vraie vue Board dans le châssis fidèle de l'app (`AppWindow`, calé sur les captures du 24/07)
 * avec les données du run (`lib/story` : mêmes colonnes, cartes, personnes que tout le reste de
 * la page). Par-dessus, deux toasts custom — le pattern « vrai board + toasts » demandé :
 * un checkpoint approuvé par un humain, et l'IA qui propose une répartition.
 *
 * Statique (SSR, aucun îlot) : c'est au-dessus de la ligne de flottaison, on protège le LCP.
 */

/* ─────────────────────────  Le board (vue kanban)  ───────────────────────── */

/** Une carte d'issue — priorité, clé `CP-xx`, titre, labels, assigné. Cf. `lib/story`. */
function BoardCard({ card }: { card: Card }) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-white p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        card.hero ? "border-primary/45 ring-primary/15 ring-1" : "border-[#e9e9ed]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[card.priority])}
        />
        <span className="text-muted-foreground font-mono text-[9.5px]">{card.key}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.35] text-foreground">{card.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1">
          {card.labels?.map((l) => (
            <span
              key={l}
              className={cn(
                "rounded border px-1 py-px text-[8.5px] font-medium capitalize",
                LABEL_STYLE[l],
              )}
            >
              {l}
            </span>
          ))}
        </span>
        {card.assignee && <PersonChip person={card.assignee} withName={false} />}
      </div>
    </article>
  );
}

/** Une colonne du board — pastille de couleur, nom, compteur, ses cartes. */
function BoardColumn({ col }: { col: Column }) {
  return (
    <div className="flex w-[186px] shrink-0 flex-col">
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

/** Le board complet dans le châssis de l'app, en mode `bleed` (il descend dans le filet). */
function HeroBoard() {
  return (
    <AppWindow
      bleed
      active="Operations"
      breadcrumb={[WORKSPACE.name, "Operations", PROJECT]}
      className="w-full"
    >
      {/* Barre du board : projet + action Auto-assign (le vrai libellé de l'app). */}
      <div className="flex items-center gap-2 border-b border-[#f0f0f3] px-4 py-2.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
          {PROJECT}
        </span>
        <span className="bg-primary text-primary-foreground ml-auto flex items-center gap-1.5 rounded-md px-2 py-[5px] text-[11px] font-medium">
          <Sparkles className="size-3" />
          Auto-assign
        </span>
      </div>

      {/* Les colonnes. `overflow-hidden` : le board déborde à droite comme un vrai board. */}
      <div className="flex gap-3 overflow-hidden px-4 py-4">
        {BOARD.map((col) => (
          <BoardColumn key={col.id} col={col} />
        ))}
      </div>
    </AppWindow>
  );
}

export function Hero() {
  return (
    <section className="bg-card relative border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--secondary) 70%, transparent))",
        }}
      />

      <div className="container-rail relative pt-20 pb-0 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-end lg:gap-16">
          <div>
            <p className="text-primary mb-4 text-[14px] font-medium tracking-[-0.01em]">
              The operating system for human-AI software delivery
            </p>
            <h1 className="t-h1">
              Describe the outcome.
              <br className="hidden sm:block" /> TaskForce runs the delivery.
            </h1>
          </div>
          <div>
            <p className="t-lead">
              You describe the outcome. TaskForce turns intent into a governed delivery run —
              planning, artifacts, approvals, and implementation through the agents you already use.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="pill">
                <a href={`${APP_URL}/auth/register`}>Run your first workflow</a>
              </Button>
              <Button asChild variant="outline" size="pill">
                <a href="/book-a-demo">Book a demo</a>
              </Button>
            </div>
            {/* Trois faits sobres — le différenciateur : gouverné, auditable, self-hostable. */}
            <p className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span>A human approves every step</span>
              <span aria-hidden className="text-border">·</span>
              <span>Every decision is auditable</span>
              <span aria-hidden className="text-border">·</span>
              <span>Runs on your own hardware</span>
            </p>
          </div>
        </div>

        {/* Preuve sociale honnête : « Built with » (pas « customers ») — l'écosystème qu'on utilise. */}
        <div className="mt-12 flex flex-col gap-5 border-t pt-8 sm:flex-row sm:items-center sm:gap-8">
          <span className="text-muted-foreground shrink-0 text-[12.5px]">
            Works with the tools your engineers already trust
          </span>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {BUILT_WITH.map((b) => (
              <li key={b.key}>
                <BrandLogo
                  brand={b.key}
                  label={b.label}
                  className="h-6 opacity-60 grayscale transition-[opacity,filter] duration-200 hover:opacity-100 hover:grayscale-0"
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Visuel produit : un VRAI board TaskForce, qui descend dans le filet de section.
            Toasts custom par-dessus — pattern « vrai board + toasts » (phase design). */}
        <div className="relative mt-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-6 bottom-0 [background:radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_65%)]"
          />
          <div className="relative mx-auto w-full max-w-5xl">
            <HeroBoard />

            {/* Toast 1 — un checkpoint approuvé par un humain : la gouvernance, en un coup d'œil. */}
            <Toast
              className="-top-3 right-3 sm:-right-4"
              icon={
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              }
            >
              <span className="font-medium">Approved</span> · Architecture
            </Toast>

            {/* Toast 2 — l'IA propose la répartition, dans le même board. */}
            <Toast
              className="bottom-12 left-3 sm:-left-4"
              icon={<Sparkles className="text-primary size-3.5 shrink-0" />}
            >
              <span className="font-medium">Smart Assign</span> · 4 issues routed
            </Toast>
          </div>
        </div>
      </div>
    </section>
  );
}
