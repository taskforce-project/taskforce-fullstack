import { useEffect, useState } from "react";
import { FlaskConical, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LabsConcept } from "./LabsConcepts";

/**
 * LabsSubjects - les directions de recherche en UNE page : barre d'onglets STICKY sous le header,
 * qui ancre-scrolle vers des sections EMPILÉES (scroll-spy). Les sections VARIENT de composition
 * (illustration-hero pleine largeur / split miroir gauche-droite, hypothèses en liste ou en grille)
 * pour ne pas se répéter. Illustration « concept » honnête (D11). Îlot React autonome.
 */

type Subject = {
  key: string;
  name: string;
  lead: string;
  why: string;
  exploring: string[];
  status: string;
  links: { href: string; label: string }[];
  at: string;
  href: string;
  mat: string;
  exp: string;
};

const MAT_BADGE: Record<string, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  beta: "border-amber-200 bg-amber-50 text-amber-700",
  planned: "border-slate-200 bg-slate-100 text-slate-600",
};
const MAT_LABEL: Record<string, string> = { live: "Live", beta: "Beta", planned: "Planned" };
const MAT_DOT: Record<string, string> = { live: "bg-emerald-500", beta: "bg-amber-500", planned: "bg-slate-400" };

export function LabsSubjects({ subjects }: { subjects: Subject[] }) {
  const [active, setActive] = useState(0);

  // Scroll-spy : la section dont le haut passe sous la barre devient active.
  useEffect(() => {
    const els = subjects
      .map((s) => document.getElementById(`lab-${s.key}`))
      .filter((e): e is HTMLElement => e !== null);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible.length) return;
        const key = visible[0].target.id.replace("lab-", "");
        const idx = subjects.findIndex((s) => s.key === key);
        if (idx >= 0) setActive(idx);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [subjects]);

  const go = (i: number) => {
    document.getElementById(`lab-${subjects[i].key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      {/* ── Barre d'onglets sticky (sous le header + bandeau beta = 100px) ── */}
      <div className="bg-card/90 sticky top-[100px] z-40 border-y border-border backdrop-blur-md">
        <div className="container-rail">
          <div role="tablist" aria-label="Research subjects" className="flex gap-1 overflow-x-auto py-2">
            {subjects.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "relative shrink-0 px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                    on ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={cn("size-1.5 rounded-full", MAT_DOT[s.mat] ?? "bg-slate-400")} />
                    {s.name}
                  </span>
                  {on && <span aria-hidden className="labs-g5 absolute inset-x-2 -bottom-2 h-[2px] rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Sections empilées, ancrées - compositions variées ── */}
      {subjects.map((s, i) => {
        const layout = i === 0 || i === 3 ? "hero" : "split";
        const illRight = i === 1; // split : Run memory à droite, Model choice à gauche

        const header = (
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="labs-gtext font-mono text-[12px] font-semibold tracking-[0.14em]">{s.exp}</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  MAT_BADGE[s.mat] ?? MAT_BADGE.planned,
                )}
              >
                {MAT_LABEL[s.mat] ?? "Planned"}
              </span>
            </div>
            <h3 className="t-h2 mt-3">{s.name}</h3>
            <p className="t-lead mt-3">{s.lead}</p>
          </div>
        );

        const why = (
          <div className="flex h-full flex-col">
            <p className="text-foreground text-[14.5px] leading-7">{s.why}</p>
            <div className="bg-card mt-6 flex items-start gap-2.5 border px-3.5 py-3">
              <FlaskConical className="labs-ic-c mt-0.5 size-4 shrink-0" strokeWidth={2} />
              <p className="text-foreground text-[13px] leading-6">
                <span className="font-medium">Where it stands.</span> {s.status}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">
              <a href={s.href} className="text-primary inline-flex items-center gap-1.5 text-[13.5px] font-medium hover:underline">
                {s.at}
                <ArrowUpRight className="size-3.5" />
              </a>
              {s.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="link-underline text-foreground inline-flex items-center gap-1.5 text-[13.5px] font-medium"
                >
                  {l.label}
                  <ArrowRight className="size-3.5" />
                </a>
              ))}
            </div>
          </div>
        );

        const exploringHeading = (
          <p className="labs-gtext font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">What we're exploring</p>
        );
        const hypGrid = (
          <div>
            {exploringHeading}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {s.exploring.map((e, j) => (
                <div key={e} className="bg-card flex flex-col gap-2 border p-4">
                  <span className="text-primary font-mono text-[11px] font-semibold">H{j + 1}</span>
                  <span className="text-foreground text-[13.5px] leading-6">{e}</span>
                </div>
              ))}
            </div>
          </div>
        );
        const hypList = (
          <div>
            {exploringHeading}
            <ul className="mt-3 flex flex-col gap-2">
              {s.exploring.map((e, j) => (
                <li key={e} className="bg-card flex items-start gap-3 border px-3.5 py-2.5">
                  <span className="text-primary mt-0.5 font-mono text-[11px] font-semibold">H{j + 1}</span>
                  <span className="text-foreground text-[13.5px] leading-6">{e}</span>
                </li>
              ))}
            </ul>
          </div>
        );

        return (
          <section key={s.key} id={`lab-${s.key}`} className="scroll-mt-[116px] border-b border-border">
            <div className="container-rail py-16 lg:py-24">
              {header}

              {layout === "hero" ? (
                <>
                  {/* Illustration en vedette, pleine largeur */}
                  <div className="flow-canvas relative mt-10 flex min-h-[200px] items-center justify-center border border-border p-6 lg:p-8">
                    <div className="w-full max-w-2xl">
                      <LabsConcept kind={s.key} />
                    </div>
                  </div>
                  <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-14">
                    {why}
                    {hypList}
                  </div>
                </>
              ) : (
                <>
                  {/* Split miroir : why d'un côté, illustration sur canvas de l'autre */}
                  <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-2 lg:gap-10">
                    <div className={cn(illRight ? "lg:order-1" : "lg:order-2")}>{why}</div>
                    <div
                      className={cn(
                        "flow-canvas relative flex min-h-[240px] items-center justify-center border border-border p-6",
                        illRight ? "lg:order-2" : "lg:order-1",
                      )}
                    >
                      <div className="w-full max-w-[420px]">
                        <LabsConcept kind={s.key} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-8">{hypGrid}</div>
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
