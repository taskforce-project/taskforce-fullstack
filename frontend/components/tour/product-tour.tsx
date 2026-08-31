"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { X, ArrowRight, ArrowLeft, Sparkles, Layers, Activity, Compass, Rocket, Zap, FlaskConical, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTourStore } from "@/lib/store/tour-store";

/**
 * Tour produit maison (coach-marks), stylé avec nos jetons shadcn - pas de dépendance externe.
 *
 * <p>Deux variantes d'étape : les <b>coach-marks</b> (petit popover + spotlight sur un vrai élément,
 * repéré par {@code data-tour="…"}) et les <b>hero</b> (grand modal centré : accueil qui explique l'app,
 * et upsell final). Piloté au clavier, rendu en portal. L'upsell ouvre le modal d'upgrade existant.</p>
 *
 * <p>Monté une fois dans {@code AppShell} ; rend {@code null} tant que le store n'est pas actif. Déclenché
 * 1× (cf. {@code hasSeen} persisté) au 1ᵉʳ dashboard, rejouable depuis l'aide.</p>
 */

interface TourPoint {
  readonly icon: React.ElementType;
  readonly title: string;
  readonly text: string;
  /** Couleur de l'icône (défaut : primaire). Ex. la fiole Labs en violet, comme dans l'app. */
  readonly iconClassName?: string;
}

interface TourStep {
  readonly title: string;
  readonly body: string;
  /** Grand modal centré (accueil / upsell) plutôt qu'un coach-mark compact. */
  readonly hero?: boolean;
  /** Icône du hero (si pas de bannière). */
  readonly icon?: React.ElementType;
  /** Image de bannière de couverture (hero) - ex. le fond « Labs » du site. */
  readonly bg?: string;
  /** Points clés listés dans un hero. */
  readonly points?: readonly TourPoint[];
  /** Sélecteur CSS de la cible (coach-mark) ; absent → centré. */
  readonly target?: string;
  /** Placement du popover : à droite (barre latérale) sinon auto (dessous/dessus). */
  readonly placement?: "auto" | "right";
  /** Action marketing optionnelle : ouvre le modal d'upgrade. */
  readonly cta?: "upgrade";
}

const STEPS: readonly TourStep[] = [
  {
    hero: true,
    icon: Compass,
    title: "Welcome to TaskForce 👋",
    body: "TaskForce is your team's command center: organize work into operations, let Cortex distribute the effort, and keep a pulse on everything in one place. A quick tour to spot the essentials.",
    points: [
      { icon: Layers, title: "Operations", text: "Projects, issues, and cycles in a clear board." },
      { icon: Sparkles, title: "Cortex (AI)", text: "Prioritizes, assigns, and assists you everywhere." },
      { icon: Activity, title: "Analytics", text: "Health, throughput, and risks in real time." },
    ],
  },
  {
    title: "Your navigation",
    body: "Command, Work, People: everything is driven from the sidebar. Your workspace and account live there too.",
    target: '[data-tour="sidebar"]',
    placement: "right",
  },
  {
    title: "Launch an operation",
    body: "An operation is a project. Create your first one here - issues, cycles, and assignment follow.",
    target: '[data-tour="create-operation"]',
  },
  {
    title: "Cortex, your copilot",
    body: "Generate specs, prioritize, assign: the AI assists you everywhere in the app. Open it in one click here.",
    target: '[data-tour="ask-ai"]',
  },
  {
    title: "Your live analytics",
    body: "Operation health, throughput, risks: your team's pulse, on real data and in real time.",
    target: '[data-tour="analytics"]',
  },
  {
    hero: true,
    bg: "/assets/tour/labs-wave.jpg",
    title: "Visual cues",
    body: "Three cues to orient you at a glance in the app.",
    points: [
      {
        icon: FlaskConical,
        iconClassName: "text-violet-500",
        title: "Labs",
        text: "A purple flask = advanced feature, still being polished (Intelligence, Brain OS).",
      },
      { icon: Zap, title: "Key action", text: "Blue marks the primary action on every screen." },
      { icon: Lock, title: "Coming soon", text: "A padlock marks an upcoming entry." },
    ],
  },
  {
    hero: true,
    icon: Rocket,
    title: "Kick it up a notch",
    body: "You're on Free: 100,000 Cortex tokens per month. A higher plan unlocks the app's full potential.",
    points: [
      { icon: Zap, title: "More Cortex tokens", text: "Enough to run the AI without counting." },
      { icon: Sparkles, title: "Full assistant", text: "Ask AI in context, everywhere." },
      { icon: Activity, title: "Advanced analytics", text: "Forecasts and expanded dashboards." },
    ],
    cta: "upgrade",
  },
];

const CARD_W = 344;
const HERO_W = 460;
const GAP = 14;
const PAD = 8;

export function ProductTour() {
  const isActive = useTourStore((s) => s.isActive);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const setStep = useTourStore((s) => s.setStep);
  const close = useTourStore((s) => s.close);
  const router = useRouter();
  const params = useParams();
  const slug = typeof params?.workspace === "string" ? params.workspace : "";

  const [mounted, setMounted] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  // « Ne plus afficher » : coché → la fermeture (croix/Échap) bloque définitivement (hasSeen) ; sinon la
  // visite revient au prochain accès.
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;
  const isHero = !!step?.hero;

  const goNext = React.useCallback(() => {
    if (isLast) close(true);
    else setStep(stepIndex + 1);
  }, [isLast, close, setStep, stepIndex]);

  const goPrev = React.useCallback(() => {
    if (stepIndex > 0) setStep(stepIndex - 1);
  }, [setStep, stepIndex]);

  const handleUpgrade = React.useCallback(() => {
    // Envoie directement sur la page des forfaits (pas d'ouverture d'un second modal par-dessus le tour).
    close(true);
    if (slug) router.push(`/${slug}/billing`);
  }, [close, router, slug]);

  React.useEffect(() => setMounted(true), []);

  // Chaque (ré)ouverture de la visite repart avec « Ne plus afficher » décochée.
  React.useEffect(() => {
    if (isActive) setDontShowAgain(false);
  }, [isActive]);

  // Position de la cible - recalculée à chaque étape + au scroll/resize. Les hero sont centrés (pas de
  // cible). Intervalle léger : suit le défilement fluide de scrollIntoView sans dépendre d'un événement.
  React.useLayoutEffect(() => {
    if (!isActive) return;
    const sel = step?.hero ? undefined : step?.target;
    if (sel) {
      document.querySelector(sel)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
    const compute = () => {
      if (!sel) return setRect(null);
      const el = document.querySelector(sel);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    compute();
    const id = window.setInterval(compute, 250);
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [isActive, stepIndex, step?.hero, step?.target]);

  // Clavier : Échap ferme, flèches naviguent.
  React.useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(dontShowAgain); // fermeture « tôt » : bloque seulement si la case est cochée
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, goNext, goPrev, close, dontShowAgain]);

  // a11y : porte le focus sur le popover à chaque étape.
  React.useEffect(() => {
    if (isActive) popoverRef.current?.focus();
  }, [isActive, stepIndex]);

  if (!mounted || !isActive || !step) return null;

  // ── Placement ────────────────────────────────────────────────────────────────
  const width = isHero ? HERO_W : CARD_W;
  let cardStyle: React.CSSProperties;
  if (isHero || !rect) {
    cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width };
  } else if (step.placement === "right") {
    const top = Math.max(GAP, Math.min(rect.top, window.innerHeight - 280));
    const left = Math.min(rect.right + GAP, window.innerWidth - width - GAP);
    cardStyle = { position: "fixed", top, left, width };
  } else {
    const placeBelow = rect.bottom < window.innerHeight * 0.55;
    const left = Math.max(GAP, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - GAP));
    cardStyle = placeBelow
      ? { position: "fixed", top: rect.bottom + GAP, left, width }
      : { position: "fixed", bottom: window.innerHeight - rect.top + GAP, left, width };
  }

  const spotStyle: React.CSSProperties | null =
    rect && !isHero
      ? {
          position: "fixed",
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px var(--primary)",
          pointerEvents: "none",
          transition: "top .2s ease, left .2s ease, width .2s ease, height .2s ease",
        }
      : null;

  const HeroIcon = step.icon ?? Sparkles;

  return createPortal(
    <div className="fixed inset-0 z-[9990]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Voile + bloqueur de clics. Sans spotlight (hero / cible manquante) : dim uniforme. */}
      <div
        className="absolute inset-0"
        style={{ background: spotStyle ? "transparent" : "rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      />

      {spotStyle && <div style={spotStyle} />}

      <div
        ref={popoverRef}
        tabIndex={-1}
        style={cardStyle}
        className="max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none"
      >
        {/* En-tête : compteur + fermer - sauf hero à bannière (l'en-tête y est superposé sur l'image) */}
        {!(isHero && step.bg) && (
          <div className={cn("flex items-center justify-between gap-3 px-4 pt-3.5", isHero && "px-6 pt-5")}>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              Step {stepIndex + 1} of {STEPS.length}
            </span>
            <button
              type="button"
              onClick={() => close(dontShowAgain)}
              aria-label="Close tour"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Corps */}
        {isHero ? (
          <>
            {step.bg && (
              // Bannière de couverture (fond « Labs » du site) ; en-tête superposé, lisible via backdrop.
              <div
                className="relative h-32 w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${step.bg})` }}
              >
                <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur">
                    <Sparkles className="size-3.5 text-primary" />
                    Step {stepIndex + 1} of {STEPS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => close(dontShowAgain)}
                    aria-label="Close tour"
                    className="flex size-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="px-6 pt-4">
              {!step.bg && (
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <HeroIcon className="size-6" />
                </div>
              )}
              <h3 className={cn("text-xl font-semibold tracking-tight text-foreground", !step.bg && "mt-4")}>
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {step.points && step.points.length > 0 && (
                <ul className="mt-5 space-y-3">
                  {step.points.map((p) => {
                    const PointIcon = p.icon;
                    return (
                      <li key={p.title} className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                          <PointIcon className={cn("size-4", p.iconClassName ?? "text-primary")} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{p.title}</p>
                          <p className="text-xs text-muted-foreground">{p.text}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="px-4 pt-3">
            <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
          </div>
        )}

        {/* Pied : opt-out (fermeture « tôt ») + progression + actions */}
        <div
          className={cn(
            "mt-4 border-t border-border px-3 py-2.5",
            isHero && "mt-6 px-4 py-3",
          )}
        >
          {/* « Ne plus afficher » - masquée sur la dernière étape (là, « Terminer » = visite complétée,
              qui bloque de toute façon). Cochée + fermeture (croix/Échap) → blocage définitif. */}
          {!isLast && (
            <label className="mb-2.5 flex w-fit cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                style={{ accentColor: "var(--primary)" }}
                className="size-3.5 rounded border-border"
              />
              Don&apos;t show this tour again
            </label>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 pl-1">
              {STEPS.map((s, i) => (
                <span
                  key={s.title}
                  className={cn("size-1.5 rounded-full transition-colors", i === stepIndex ? "bg-primary" : "bg-border")}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {!isFirst && (
                <Button variant="ghost" size="sm" onClick={goPrev}>
                  <ArrowLeft /> Back
                </Button>
              )}
              {step.cta === "upgrade" ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => close(true)}>
                    Finish
                  </Button>
                  <Button size="sm" onClick={handleUpgrade}>
                    View plans <Sparkles />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={goNext}>
                  {isFirst ? "Let's go" : isLast ? "Finish" : "Next"}
                  {!isLast && <ArrowRight />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
