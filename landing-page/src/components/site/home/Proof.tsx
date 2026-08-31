import type { CSSProperties } from "react";
import { Check, ShieldCheck, SlidersHorizontal, Activity, ArrowRight, PenLine, Network, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "../Section";
import { AppShot, Toast } from "../AppShot";
import { BrandLogo } from "../BrandLogo";

/**
 * Proof - conformité, intégrations, direction, CTA final.
 * Pas de logo client ni de témoignage : la preuve est technique (décision D9).
 */

/* ─────────────────────────  Entreprise & conformité (badges + checklist 3 colonnes)  ───────────────────────── */

/** Trois colonnes façon Relevance, chaque item = une vraie capacité produit. */
const TRUST_COLUMNS: { icon: typeof ShieldCheck; ic: string; group: string; items: string[] }[] = [
  {
    icon: ShieldCheck,
    ic: "#d97706",
    group: "Security & data",
    items: ["Self-hosting, your network", "Encryption in transit & at rest", "Secrets out of the codebase", "No training on your data"],
  },
  {
    icon: SlidersHorizontal,
    ic: "#2563eb",
    group: "Access & controls",
    items: ["SSO / SAML via Keycloak", "Roles & permissions", "A human sign-off at each checkpoint", "Per-project access"],
  },
  {
    icon: Activity,
    ic: "#0891b2",
    group: "Monitoring & oversight",
    items: ["Full audit trail", "Who approved what, and when", "Which model ran where", "Delivery analytics"],
  },
];

export function Trust() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Enterprise"
        title="Built to survive a security review"
        lead="AI in the delivery path raises exactly the questions you would expect. We would rather answer them on a page than in a questionnaire."
      />

      {/* Décision review (26/07) : mener par des FAITS, pas par une rangée de badges qui
          « se lit comme une checklist ». Trois affirmations concrètes portent la gouvernance. */}
      <div className="mt-12 grid gap-x-10 gap-y-8 border-t pt-10 sm:grid-cols-3">
        {[
          { stat: "Every run is attributable", sub: "Each checkpoint records what produced it and who approved it." },
          { stat: "Every approval is recorded", sub: "Who signed off, when, and exactly what they were signing off on." },
          { stat: "Every model call is logged", sub: "Which model ran which step, on whose infrastructure." },
        ].map((t) => (
          <div key={t.stat}>
            <p className="t-h3">{t.stat}</p>
            <p className="text-muted-foreground mt-2 text-[13.5px] leading-6">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* PREUVE « dure » (phase design) : la vraie UI de l'audit trail. Cadre d'app VIDE, à
          remplir avec une capture ; toast custom par-dessus (pattern « vrai screen + toasts »). */}
      <div className="mt-12">
        <AppShot chrome="app.taskforce-project.fr/runs/checkout-redesign · audit">
          <Toast
            className="right-4 top-4"
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            }
          >
            <span className="font-medium">Approved</span> · CTO · logged to the audit trail
          </Toast>
        </AppShot>
        <p className="text-muted-foreground mt-3 text-[12.5px]">
          Your real audit view drops in here - every approval, rejection and model call, attributable.
        </p>
      </div>

      {/* Checklist en 3 colonnes */}
      <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_COLUMNS.map((col) => (
          <div key={col.group}>
            <p className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
              <span
                className="ic-tile flex size-7 items-center justify-center rounded-md border"
                style={{ "--ic": col.ic } as CSSProperties}
              >
                <col.icon className="size-4" strokeWidth={1.9} />
              </span>
              {col.group}
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {col.items.map((it) => (
                <li key={it} className="flex items-start gap-2 text-[14px] leading-6 text-foreground">
                  <Check className="text-primary mt-[3px] size-4 shrink-0" strokeWidth={2.5} />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Conformité dite sans surpromesse (review 7 : « SOC 2 in progress » invite « montrez le
          rapport »). On parle d'architecture PRÊTE et de feuille de route, pas de certif obtenue. */}
      <p className="text-muted-foreground mt-12 text-[13px]">
        Built for SOC 2 readiness, GDPR-ready by architecture, with a security roadmap you can read
        on the{" "}
        <a href="/trust" className="link-underline text-foreground">
          trust center
        </a>
        .
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="outline" size="pill">
          <a href="/trust">Read the trust center</a>
        </Button>
        <Button asChild variant="ghost" size="pill">
          <a href="/legal/ai-transparency">
            AI transparency
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>
    </Section>
  );
}

/* ─────────────────────────  Intégrations (vraie grille de logos)  ───────────────────────── */

/** Vrais logos vendorisés - grille façon Relevance « Connect to N apps ». */
const INTEGRATIONS = [
  "github", "gitlab", "linear", "slack", "notion", "figma", "sentry", "vscode",
  "docker", "vercel", "netlify", "cloudflare", "aws", "azure", "gcp", "postgresql",
  "supabase", "prisma", "anthropic", "openai", "gemini", "mistral", "ollama", "huggingface",
  "asana", "discord", "zoom", "gmail", "dropbox", "keycloak", "auth0", "cursor",
];

export function Integrations() {
  return (
    <Section>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeader
          eyebrow="Integrations"
          level="live"
          title="TaskForce doesn’t replace your stack. It connects to it."
          lead={
            <>
              The same connector catalogue as the app - <span className="text-primary">129</span>{" "}
              tools across your tracker, repo, chat and cloud. Adding one is a line of configuration,
              not a release.
            </>
          }
        />
        <a
          href="/integrations"
          className="link-underline text-foreground flex shrink-0 items-center gap-1 text-[14px] font-medium"
        >
          Browse all integrations
          <ArrowRight className="size-4" />
        </a>
      </div>

      <ul className="bg-border mt-12 grid grid-cols-4 gap-px overflow-hidden border sm:grid-cols-6 lg:grid-cols-8">
        {INTEGRATIONS.map((key) => (
          <li
            key={key}
            className="tile-hover bg-card flex aspect-square items-center justify-center p-4"
          >
            <BrandLogo
              brand={key}
              label={key}
              className="h-7 w-7 object-contain opacity-70 grayscale"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ─────────────────────────  La direction  ───────────────────────── */

/**
 * Décision D11 : on vend la direction, **pas le mécanisme**.
 * Rien ici ne décrit comment c'est construit - ni la boucle de raisonnement, ni le routage
 * de modèles, ni la méthode de benchmark. Une vision se vend ; une recette se copie.
 */
const AHEAD = [
  {
    icon: PenLine,
    ic: "#2563eb",
    title: "Less drafting, more deciding",
    text: "Every checkpoint that gets reliable is one you stop writing yourself. The direction is not fewer humans - it is humans spending their time on the decisions instead of the paperwork around them.",
  },
  {
    icon: Network,
    ic: "#7c3aed",
    title: "An intelligence layer for the organization",
    text: "The decisions, constraints and trade-offs one run records don’t belong to engineering alone. The same graph that tells an agent why the system is the way it is can tell any team why the organization is - a live model to decide on top of, not a wiki to search.",
  },
  {
    icon: Server,
    ic: "#64748b",
    title: "Still your infrastructure",
    text: "Self-hosting is a first-class deployment - it comes with Enterprise, and where your models run stays your decision.",
  },
];

export function WhereThisGoes() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-0">
        <div className="lg:pr-14">
          <SectionHeader
            eyebrow="The direction"
            title="Software teams won’t hand-write specs forever"
            lead="TaskForce runs software delivery today - that’s the wedge, not the ceiling. The memory that keeps one run’s context is the same intelligence an organization loses everywhere else: in meetings, in chat, in people’s heads. The destination is to make it the active layer every team decides on top of. The roadmap is public - hold us to it rather than trust a pitch."
          />
          <Button asChild variant="outline" size="pill" className="mt-8">
            <a href="/roadmap">
              See the public roadmap
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>

        {/* « Traits intégrés » : filet vertical qui relie la colonne au reste de la page, rails
            haut/bas + séparateurs entre lignes. Pas de radius (réservé aux canvases de flux). */}
        <ul className="divide-border divide-y lg:pl-14">
          {AHEAD.map((n, i) => (
            <li key={n.title} className="hover:bg-secondary/30 flex gap-5 py-6 transition-colors">
              <span
                className="ic-tile flex size-10 shrink-0 items-center justify-center rounded-lg border"
                style={{ "--ic": n.ic } as CSSProperties}
              >
                <n.icon className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[15px] font-semibold text-foreground">{n.title}</h3>
                </div>
                <p className="text-muted-foreground mt-2 text-[13.5px] leading-6">{n.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ─────────────────────────  CTA final  ───────────────────────── */

export function FinalCta() {
  return (
    <section className="bg-secondary">
      <div className="container-rail py-24">
        <div className="bg-card relative overflow-hidden rounded-3xl border px-8 py-16 text-center sm:py-20">
          <h2 className="t-h2 relative">Start with one run</h2>
          <p className="t-lead relative mx-auto mt-4 max-w-lg">
            Describe an outcome you were going to spec by hand this week. See what comes back, then
            decide whether it belongs in your process.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="pill-lg">
              <a href={"/waitlist"}>Run your first workflow</a>
            </Button>
            <Button asChild variant="outline" size="pill-lg">
              <a href="/book-a-demo">Book a demo</a>
            </Button>
          </div>
          <p className="text-muted-foreground relative mt-6 text-[12.5px]">
            No credit card. Free forever to start.
          </p>
        </div>
      </div>
    </section>
  );
}
