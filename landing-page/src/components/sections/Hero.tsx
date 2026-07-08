import { Lock } from "lucide-react";

/**
 * Hero — section de référence (light-only). Métriques typo/nav relevées sur linear.app + attio.com.
 * Le visuel produit est un MOCK d'écran vide (fenêtre browser) — placeholder à remplacer par une
 * vraie capture de l'app (déposer dans public/, cf. le <img> commenté ci-dessous).
 * Spec : taskforce-docs/v1/14-design/landing-refonte/Spec_Master.md §5-6.
 */

export function Hero() {
  return (
    <section className="relative bg-background pb-24 pt-36 lg:pt-40">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        {/* Headline (métrique Linear : 64px/510/-0.022em/lh1, gauche) */}
        <h1 className="anim-rise text-[40px] font-[510] leading-[1.06] tracking-[-0.022em] text-foreground sm:text-[52px] sm:leading-[1.03] lg:text-[64px] lg:leading-[1.0]">
          Describe the outcome.
          <br className="hidden md:block" /> TaskForce orchestrates the execution.
        </h1>

        <p
          className="anim-rise mt-6 max-w-[520px] text-[15px] leading-6 text-muted-foreground"
          style={{ "--rise-delay": "90ms" } as React.CSSProperties}
        >
          Purpose-built to run software delivery with AI agents. You describe the outcome, TaskForce
          plans the pipeline — and you approve every checkpoint.
        </p>

        <div
          className="anim-rise mt-7 flex items-center gap-2.5"
          style={{ "--rise-delay": "180ms" } as React.CSSProperties}
        >
          <a
            href="http://localhost:3000/auth/register"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-foreground px-4 text-sm font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.08),0_3px_3px_-1px_rgba(0,0,0,0.06)] transition-opacity hover:opacity-90"
          >
            Start for free
          </a>
          <a
            href="/contact"
            className="inline-flex h-9 items-center rounded-[10px] border border-black/[0.08] bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-black/[0.16] hover:text-foreground"
          >
            Talk to sales
          </a>
        </div>

        {/* ─── Écran produit (placeholder vide, à remplacer par une capture) ─── */}
        <div className="anim-rise mt-16" style={{ "--rise-delay": "300ms" } as React.CSSProperties}>
          <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_32px_80px_-24px_rgba(0,0,0,0.18)]">
            {/* Barre de navigateur */}
            <div className="flex h-11 items-center gap-2 border-b border-black/[0.06] px-4">
              <span className="size-3 rounded-full bg-red-400/70" />
              <span className="size-3 rounded-full bg-amber-400/70" />
              <span className="size-3 rounded-full bg-green-400/70" />
              <div className="mx-auto flex items-center gap-1.5 rounded-md border border-black/[0.06] bg-secondary/50 px-3 py-1 text-[12px] text-muted-foreground">
                <Lock className="size-3" />
                app.taskforce.dev
              </div>
              <span className="w-12 shrink-0" aria-hidden />
            </div>

            {/* Zone d'écran vide — déposer la capture ici :
                <img src="/product/hero.png" alt="TaskForce app" className="block w-full" />
                (retirer le placeholder ci-dessous) */}
            <div
              className="relative flex aspect-[16/9] items-center justify-center"
              style={{ background: "linear-gradient(180deg,#fafafb 0%,#f4f4f6 100%)" }}
            >
              <div className="flex flex-col items-center gap-3">
                <img
                  src="/logo_taskforce_tp.png"
                  alt=""
                  aria-hidden
                  className="size-14 object-contain opacity-[0.10]"
                />
                <span className="text-xs font-medium tracking-wide text-muted-foreground/50">
                  Product screenshot
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
