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
        {/* Copie du hero — CENTRÉE et épurée (façon Linear/Relevance) : titre en haut, une promesse,
            deux actions. Une seule colonne → fini le désalignement titre/texte du layout 2-col. */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-primary mb-4 text-[14px] font-medium tracking-[-0.01em]">
            The AI delivery operating system
          </p>
          <h1 className="t-h1 text-balance">
            Describe the outcome.
            <br className="hidden sm:block" /> TaskForce runs the delivery.
          </h1>
          <p className="t-lead mx-auto mt-6 max-w-2xl text-balance">
            TaskForce turns an outcome into the spec, the plan and the prompt your coding agent runs —
            a human approves every step, and the reasons are remembered.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="pill-lg">
              <a href={`${APP_URL}/auth/register`}>Run your first workflow</a>
            </Button>
            <Button asChild variant="outline" size="pill-lg">
              <a href="/book-a-demo">Book a demo</a>
            </Button>
          </div>
        </div>

        {/* Preuve sociale honnête : « Works with » (pas « customers ») — l'écosystème qu'on utilise. Centré. */}
        <div className="mt-14 flex flex-col items-center gap-5">
          <span className="text-muted-foreground text-[12.5px]">
            Works with the tools your engineers already trust
          </span>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
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
