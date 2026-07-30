import { ArrowRight, Check, Plus } from "lucide-react";
import { useScene } from "@/lib/useScene";
import { Section, SectionHeader, LevelBadge } from "../Section";
import { cn } from "@/lib/utils";

/**
 * RunTimeline — LA démonstration de la page (décision review 26/07).
 *
 * Le reste du site est statique et met des placeholders ; ici, une seule fois, on
 * MONTRE le mécanisme au lieu de le décrire : un outcome qui avance checkpoint par
 * checkpoint, chaque étape passant « en attente d'approbation » puis « approuvée »,
 * jusqu'au déploiement — puis ça reboucle.
 *
 * Ce n'est PAS un faux écran ni de fausses données : c'est un schéma du run (des
 * noms d'étapes et des états), animé. Aucun chiffre inventé (pas de « 4/4 tests »),
 * seulement le flux, qui lui est réel. Piloté par `useScene` (rAF + horloge de
 * visibilité), donc robuste au throttling des onglets d'arrière-plan, et figé sur
 * l'état final sous `prefers-reduced-motion`.
 */

const STEPS: { step: string; by: string }[] = [
  { step: "Vision", by: "Product agent" },
  { step: "Product spec", by: "Product agent" },
  { step: "Architecture", by: "Architecture agent" },
  { step: "API contract", by: "Architecture agent" },
  { step: "Breakdown", by: "Delivery agent" },
  { step: "Implementation", by: "Claude Code" },
  { step: "QA & deploy", by: "Delivery agent" },
];

/**
 * Deux sous-phases par checkpoint : l'agent DESSINE l'artefact (« draft »), puis le run
 * ATTEND l'humain (« review »). C'est le passage agent → humain qu'on veut montrer. Le temps
 * d'attente est un peu plus long : c'est le moment focal (l'humain décide).
 */
const STEP_BEATS: [number, number][] = [
  [850, 1050], // Vision
  [850, 1050], // Product spec
  [900, 1200], // Architecture (décision coûteuse → silence plus long)
  [850, 1050], // API contract
  [850, 1050], // Breakdown
  [1500, 1300], // Implementation (l'agent code plus longtemps)
  [850, 1150], // QA & deploy
];
const BEATS = STEP_BEATS.flat(); // 14 battements
/** Battement de repos (reduced-motion) : étape 4, en attente d'approbation — pas « Shipped ». */
const RESTING = 7;

/** Les trois garanties du mécanisme — compagnes de lecture de la timeline. */
const RUN_SUB = [
  { title: "Every step is attributable", text: "Each checkpoint names what produced it and the model it ran on." },
  { title: "Nothing advances without you", text: "Each checkpoint waits for a human — which is exactly what lets you hand agents more, not less." },
  { title: "Rejections carry your comment", text: "Send a step back with a note and it comes into the next attempt." },
];

/** Faits « entreprise » → puces « + » numérotées façon Linear (1.1 … 1.4). */
const RUN_BULLETS = [
  { label: "Full audit trail" },
  { label: "Self-hosted" },
  { label: "Any coding agent" },
  { label: "A model per step" },
];

/**
 * Le détail de chaque checkpoint — fusionné dans « The run » (review 27/07 : la section
 * « Anatomy » séparée faisait doublon). Ordre = vrai ordre d'exécution.
 */
const ANATOMY: { step: string; by: string; artifact: string; decision: string; level?: "live" | "beta" | "labs" }[] = [
  { step: "Vision", by: "Product agent", artifact: "One page: the problem, who has it, what « done » looks like.", decision: "Approve the framing, or reframe it before anything is built on top.", level: "labs" },
  { step: "Product spec", by: "Product agent", artifact: "Stories with acceptance criteria, and the edge cases nobody asked about.", decision: "Approve, or send it back with what is missing.", level: "labs" },
  { step: "Architecture", by: "Architecture agent", artifact: "The proposed approach — and the option that was rejected, with the reason.", decision: "Approve the trade-off. This is the decision that is expensive to reverse later.", level: "labs" },
  { step: "API contract", by: "Architecture agent", artifact: "Endpoints, payloads and error cases, written against your existing conventions.", decision: "Approve or amend. Downstream steps are generated from what you sign here.", level: "labs" },
  { step: "Breakdown", by: "Delivery agent", artifact: "Issues, sized and ordered, each linked back to the line of spec it came from.", decision: "Approve — then Smart Assign routes each issue to a person.", level: "live" },
  { step: "Implementation", by: "Your coding agent", artifact: "A branch. TaskForce hands over the context and stays out of the way.", decision: "Your normal code review. We do not replace it.", level: "live" },
  { step: "QA & deploy", by: "Delivery agent", artifact: "A checklist derived from the acceptance criteria you approved in step two.", decision: "Sign off. The whole chain is in the audit trail.", level: "beta" },
];

type Phase = "draft" | "review";

function StateChip({
  done,
  active,
  phase,
  step,
}: {
  done: boolean;
  active: boolean;
  phase: Phase;
  step: string;
}) {
  if (done) {
    return (
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11.5px]">
        <Check className="size-3" strokeWidth={2.5} />
        Approved
      </span>
    );
  }
  if (!active) return null;

  const impl = step === "Implementation";

  // Phase « draft » : l'AGENT travaille — discret, gris, une puce qui pulse.
  if (phase === "draft") {
    return (
      <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-[11.5px]">
        <span className="bg-muted-foreground/60 size-1.5 animate-pulse rounded-full" />
        {impl ? "Writing code…" : "Generating artifact…"}
      </span>
    );
  }

  // Phase « review » : le run ATTEND l'humain — moment focal, en primaire.
  return (
    <span className="border-primary/30 bg-primary/5 text-primary flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium">
      <span className="bg-primary size-1.5 animate-pulse rounded-full" />
      {impl ? "Running checks" : "Awaiting approval"}
    </span>
  );
}

export function RunTimeline() {
  const scene = useScene(BEATS, { loopAfter: 2400, threshold: 0.4 });
  // État de repos (reduced-motion) : mi-parcours, en attente d'approbation — pas « Shipped ».
  const beat = scene.reduced ? RESTING : scene.beat; // 0..14
  const stepIndex = Math.min(Math.floor(beat / 2), STEPS.length); // étape courante 0..7
  const phase: Phase = beat % 2 === 0 ? "draft" : "review";
  const allDone = beat >= STEPS.length * 2;

  return (
    <Section band>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
        {/* Colonne texte */}
        <div className="lg:sticky lg:top-28">
          <SectionHeader
            index="1.0"
            indexHref="/product/orchestration"
            eyebrow="The run"
            title="Watch one outcome become a shipped change"
            lead="A delivery is a sequence of decisions, not a single prompt. TaskForce makes each one explicit: an agent drafts it, a human signs it off, and the run moves on."
          />

          <ul className="mt-8 flex flex-col gap-5">
            {RUN_SUB.map((s) => (
              <li key={s.title}>
                <h3 className="text-[14.5px] font-semibold text-foreground">{s.title}</h3>
                <p className="text-muted-foreground mt-1 text-[13.5px] leading-6">{s.text}</p>
              </li>
            ))}
          </ul>

          <a
            href="/product/orchestration"
            className="link-underline text-primary mt-8 inline-flex items-center gap-1 text-[14px] font-medium"
          >
            See a run end to end
            <ArrowRight className="size-4" />
          </a>
        </div>

        {/* Colonne timeline — l'îlot animé (client:idle dans index.astro). */}
        <div ref={scene.ref} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
          {/* En-tête du run */}
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className={cn("size-2 rounded-full", allDone ? "bg-emerald-500" : "bg-primary")} />
              <span className="text-[13px] font-medium text-foreground">Run · Checkout redesign</span>
            </div>
            <span className="text-muted-foreground text-[12px]">
              {allDone ? "Shipped" : `Step ${stepIndex + 1} of ${STEPS.length}`}
            </span>
          </div>

          {/* La colonne verticale de checkpoints */}
          <ol className="px-5 py-6">
            {STEPS.map((s, i) => {
              const done = beat >= i * 2 + 2;
              const isActive = !allDone && stepIndex === i;
              return (
                <li key={s.step} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Connecteur vers le checkpoint suivant : teinté une fois franchi. */}
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-7 bottom-0 left-[13px] w-px",
                        done ? "bg-primary/40" : "bg-border",
                      )}
                    />
                  )}

                  {/* Nœud : numéro → puce active (anneau d'attention) → coche approuvée. */}
                  <span
                    className={cn(
                      "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                      done && "border-primary bg-primary text-primary-foreground",
                      isActive && "border-primary bg-primary/10 text-primary anim-attention",
                      !done && !isActive && "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>

                  {/* Libellé + état */}
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-0.5">
                    <div>
                      <p
                        className={cn(
                          "text-[14px] font-medium",
                          done || isActive ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.step}
                      </p>
                      <p className="text-muted-foreground text-[12px]">{s.by}</p>
                    </div>
                    <StateChip done={done} active={isActive} phase={phase} step={s.step} />
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Pied : l'état final porte le message. */}
          <div className="border-t px-5 py-3.5">
            {allDone ? (
              <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-600">
                <Check className="size-4" strokeWidth={2.5} />
                Shipped — every decision in the audit trail
              </p>
            ) : (
              <p className="text-muted-foreground text-[13px]">
                A human approves each checkpoint before the run continues.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Puces « + » numérotées façon Linear (1.1 … 1.4), sous la démonstration. */}
      <div className="mt-12 flex flex-wrap gap-2.5 border-t pt-8">
        {RUN_BULLETS.map((b, i) => (
          <span
            key={b.label}
            className="bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px]"
          >
            <span className="text-muted-foreground font-mono text-[11px] tabular-nums">{`1.${i + 1}`}</span>
            <span className="font-medium text-foreground">{b.label}</span>
            <Plus aria-hidden className="text-muted-foreground size-3" strokeWidth={2} />
          </span>
        ))}
      </div>

      {/* Le détail, sous la démonstration : ce que chaque checkpoint produit et ce que la
          personne décide. (Ancienne section « Anatomy », fusionnée ici — review 27/07.) */}
      <div className="mt-16">
        <h3 className="t-h3">Seven checkpoints. Seven artifacts. One accountable chain.</h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-[14px] leading-7">
          Not a black box that returns a pull request — a sequence of artifacts, each one
          attributable, each one refusable.
        </p>

        <div className="bg-card mt-7 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <caption className="sr-only">
              What each checkpoint of a run produces and what the human decides
            </caption>
            <thead>
              <tr className="bg-secondary/50 text-muted-foreground text-[11px] tracking-[0.06em] uppercase">
                <th scope="col" className="px-5 py-3 font-medium">Checkpoint</th>
                <th scope="col" className="rail-x px-5 py-3 font-medium">Produced by</th>
                <th scope="col" className="rail-x px-5 py-3 font-medium">What lands in your workspace</th>
                <th scope="col" className="rail-x px-5 py-3 font-medium">What you decide</th>
              </tr>
            </thead>
            <tbody>
              {ANATOMY.map((r, i) => (
                <tr key={r.step} className="border-t align-top transition-colors hover:bg-secondary/30">
                  <th scope="row" className="px-5 py-4 text-left">
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="text-[14px] font-medium text-foreground">{r.step}</span>
                      {r.level && <LevelBadge level={r.level} />}
                    </span>
                  </th>
                  <td className="rail-x text-muted-foreground px-5 py-4 text-[13px] whitespace-nowrap">
                    {r.by}
                  </td>
                  <td className="rail-x px-5 py-4 text-[13.5px] leading-6 text-foreground">
                    {r.artifact}
                  </td>
                  <td className="rail-x text-muted-foreground px-5 py-4 text-[13.5px] leading-6">
                    {r.decision}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-secondary/40 mt-6 rounded-xl border px-5 py-4">
          <p className="text-[14px] font-semibold text-foreground">Adaptive by design</p>
          <p className="text-muted-foreground mt-1 text-[13.5px] leading-6">
            A bug fix doesn’t need a strategy phase; a migration doesn’t take the same path as a
            feature launch. The run adapts to the decision being made — it just never skips the
            approval.
          </p>
        </div>
      </div>
    </Section>
  );
}
