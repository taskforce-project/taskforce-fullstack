import type { CSSProperties } from "react";
import { Check, ShieldCheck, SlidersHorizontal, Activity, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/components/site/nav";
import { Section, SectionHeader } from "../Section";
import { AppShot, Toast } from "../AppShot";

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

/**
 * Contenu de la « vraie vue d'audit » posée DANS le cadre d'app (AppShot) - remplace l'ancien
 * corps vide. Feed d'evenements attribuables (approbations, refus, appels modele, assignations)
 * facon audit trail : point de statut, evenement, acteur/role, modele, horodatage.
 */
const AUDIT_EVENTS: { dot: string; type: string; what: string; who: string; meta?: string; when: string }[] = [
  { dot: "#059669", type: "Approved", what: "Architecture · Postgres over MongoDB", who: "Inès · CTO", meta: "claude-sonnet-5", when: "2m" },
  { dot: "#d97706", type: "Sent back", what: "API contract · error cases", who: "Inès · CTO", meta: "needs idempotency", when: "6m" },
  { dot: "#059669", type: "Approved", what: "Product spec · Checkout", who: "Théo · CPO", meta: "claude-opus-5", when: "14m" },
  { dot: "#4f46e5", type: "Model call", what: "Breakdown drafted", who: "COO agent", meta: "gpt-oss-20b · self-hosted", when: "21m" },
  { dot: "#059669", type: "Approved", what: "Vision · Checkout redesign", who: "Théo · CPO", when: "34m" },
  { dot: "#059669", type: "Assigned", what: "Implementation → Maya", who: "Léo · COO", meta: "Claude Code", when: "42m" },
  { dot: "#4f46e5", type: "Model call", what: "Spec drafted", who: "CPO agent", meta: "claude-opus-5", when: "55m" },
  { dot: "#059669", type: "Approved", what: "Breakdown · 8 issues", who: "Léo · COO", when: "1h" },
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
          {/* La vraie vue d'audit : feed d'evenements attribuables qui remplit le cadre (les
              lignes s'etirent en flex-1 -> aucun vide, quel que soit le ratio). */}
          <div className="absolute inset-0 flex flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <ShieldCheck className="size-4 shrink-0" strokeWidth={2} style={{ color: "#d97706" }} />
              <span className="text-foreground text-[13px] font-medium">Audit trail</span>
            </div>
            <ul className="flex flex-1 flex-col divide-y divide-border">
              {AUDIT_EVENTS.map((e) => (
                <li key={`${e.type}-${e.what}`} className="flex flex-1 items-center gap-3 px-4">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.dot }} />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-[12.5px]">
                      <span className="font-medium">{e.type}</span> · {e.what}
                    </span>
                    <span className="text-muted-foreground block text-[11px]">{e.who}</span>
                  </span>
                  {e.meta && (
                    <span className="text-muted-foreground hidden shrink-0 rounded border px-1.5 py-px font-mono text-[10px] md:inline">
                      {e.meta}
                    </span>
                  )}
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">{e.when}</span>
                </li>
              ))}
            </ul>
            <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-[10.5px]">
              <span>checkout-redesign · 5 of 7 checkpoints approved</span>
              <span className="hidden sm:inline">Immutable · exportable to your SIEM</span>
            </div>
          </div>
          <Toast
            className="right-4 top-3"
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
          Every approval, rejection and model call, attributable - and exportable to your SIEM.
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

/* La section « The direction » (WhereThisGoes) a fusionné le 24/09 dans le bandeau bas de
 * `Showcase.tsx › TeamGrid` : « the wedge, not the ceiling » + lien vers la roadmap publique. */

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
              <a href={`${APP_URL}/auth/register`}>Run your first workflow</a>
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
