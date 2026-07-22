import { Target, Workflow, CheckCircle2 } from "lucide-react";

/** HowItWorks — les 3 temps du produit (light). Décrit l'outcome → orchestration → approbation. */

const STEPS = [
  {
    icon: Target,
    title: "Describe the outcome",
    text: "Tell TaskForce what you want to ship — a feature, a fix, a release. No tickets to write.",
  },
  {
    icon: Workflow,
    title: "TaskForce orchestrates",
    text: "It plans the delivery pipeline and drives your AI agents through each step, in the right order.",
  },
  {
    icon: CheckCircle2,
    title: "You approve & ship",
    text: "Review every checkpoint. Approve, and the agents move on. Reject, and they retry. You stay in control.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-indigo-600">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[1.1]">
            From intent to shipped, in three steps
          </h2>
        </div>

        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl border border-black/[0.08] bg-card text-foreground shadow-sm">
                  <s.icon className="size-5" strokeWidth={1.75} />
                </span>
                {/* Sans le `/60`, qui ramenait le contraste à 2,84:1 (Lighthouse, 22/07). */}
                <span className="text-[13px] font-medium text-muted-foreground">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-[14px] leading-6 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
