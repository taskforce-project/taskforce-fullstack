import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "../BrandLogo";
import { Toast } from "../AppShot";
import { SpecPanel } from "../scene/SpecPanel";
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
 * Hero — titre, promesse, CTA, et l'ACTE produit réellement livré comme visuel.
 *
 * Décision (audit v2 + plan) : le hero ne montre plus un board kanban (le signal « PM tool »),
 * mais l'acte shippé — une issue → l'IA rédige spec + prompt Claude Code + découpage, ancré dans
 * la mémoire, et un humain approuve. Le vrai châssis d'app (`SpecPanel` → `AppWindow`), deux toasts
 * par-dessus. Statique (SSR, aucun îlot) : c'est au-dessus de la ligne de flottaison, on protège le LCP.
 */
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
              The AI delivery operating system
            </p>
            <h1 className="t-h1">
              Describe the outcome.
              <br className="hidden sm:block" /> TaskForce runs the delivery.
            </h1>
          </div>
          <div>
            <p className="t-lead">
              You describe the outcome. TaskForce drafts the spec, the plan and the prompt your coding
              agent runs, keeps you on every decision, and remembers why. Today it works issue by issue —
              the full governed run is where it is headed.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="pill">
                <a href={`${APP_URL}/auth/register`}>Run your first workflow</a>
              </Button>
              <Button asChild variant="outline" size="pill">
                <a href="/book-a-demo">Book a demo</a>
              </Button>
            </div>
            {/* Trois faits sobres — le différenciateur : gouverné, local à coût zéro, self-hostable. */}
            <p className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span>You approve every decision</span>
              <span aria-hidden className="text-border">·</span>
              <span>Runs on your models — local or hosted</span>
              <span aria-hidden className="text-border">·</span>
              <span>Self-hosted, your network</span>
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

        {/* Visuel produit : l'acte IA réel, qui descend dans le filet de section.
            Toasts custom par-dessus — pattern « vrai screen + toasts » (phase design). */}
        <div className="relative mt-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-6 bottom-0 [background:radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_65%)]"
          />
          <div className="relative mx-auto w-full max-w-5xl">
            <SpecPanel />

            {/* Toast 1 — la décision approuvée part en mémoire : gouvernance + mémoire, en un coup d'œil. */}
            <Toast
              className="-top-3 right-3 sm:-right-4"
              icon={
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              }
            >
              <span className="font-medium">Approved</span> · saved to Memory
            </Toast>

            {/* Toast 2 — le prompt d'exécution, prêt pour le coding agent. */}
            <Toast
              className="bottom-12 left-3 sm:-left-4"
              icon={<Sparkles className="text-primary size-3.5 shrink-0" />}
            >
              <span className="font-medium">Claude Code prompt</span> · ready
            </Toast>
          </div>
        </div>
      </div>
    </section>
  );
}
