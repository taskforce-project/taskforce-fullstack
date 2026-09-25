import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, Brain, Check, GitPullRequest, Loader2, Sparkles, UserCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BrandLogo } from "../BrandLogo";
import { AGENTS, PEOPLE, WORKSPACE, type Agent, type Person } from "@/lib/story";

/**
 * HeroRuns - la table de runs VIVANTE du hero, pilotée par des onglets par rôle (pattern Relevance :
 * « Sales leaders / CS leaders » au-dessus d'un tableau qui tourne).
 *
 * Le run du haut est en direct : TaskForce (ou l'agent de code) travaille, puis la ligne attend
 * l'approbation d'un humain, puis elle se range dans l'historique et le run suivant arrive en tête.
 * C'est la promesse du produit en une boucle : le travail avance, un humain valide chaque étape.
 *
 * HONNÊTETÉ (règle de `story.ts`) : démo illustrée sur le workspace fictif Northwind, marquée
 * « Illustrative ». Aucun chiffre d'usage. Les étapes montrées sont celles que le produit fait
 * aujourd'hui : rédiger spec / plan / prompt, Smart Assign, approbation, Memory, délégation du build
 * à un agent de code.
 *
 * Rendu serveur = état figé lisible (le 1er run en attente d'approbation). L'île s'hydrate en
 * `client:idle` : la boucle ne tourne qu'à l'écran et jamais si prefers-reduced-motion.
 */

type Owner =
  | { kind: "taskforce" }
  | { kind: "agent"; agent: Agent }
  | { kind: "person"; person: Person };

/** L'état final d'un run une fois l'humain passé. */
type Settled = "approved" | "pr" | "shipped" | "assigned" | "memory";

type Run = { key: string; title: string; step: string; owner: Owner; settled: Settled };

type Role = {
  id: string;
  label: string;
  href: string;
  /** Ordre d'affichage initial, de haut en bas. Le 1er est le run en direct. */
  runs: readonly [Run, Run, Run, Run, Run];
};

const TF: Owner = { kind: "taskforce" };
const agent = (a: Agent): Owner => ({ kind: "agent", agent: a });
const person = (p: Person): Owner => ({ kind: "person", person: p });

const ROLES: readonly Role[] = [
  {
    id: "engineering",
    label: "Engineering",
    href: "/solutions/engineering",
    runs: [
      { key: "CP-12", title: "Let customers export their invoices", step: "Spec", owner: TF, settled: "approved" },
      { key: "CP-14", title: "Add SSO with Okta", step: "Build", owner: agent(AGENTS.claude), settled: "pr" },
      { key: "CP-09", title: "Rate-limit the public API", step: "Plan", owner: TF, settled: "approved" },
      { key: "CP-17", title: "Fix the flaky billing test", step: "Assign", owner: person(PEOPLE.leo), settled: "assigned" },
      { key: "CP-05", title: "Upgrade the API to Node 22", step: "Build", owner: agent(AGENTS.cursor), settled: "shipped" },
    ],
  },
  {
    id: "product",
    label: "Product",
    href: "/solutions/product",
    runs: [
      { key: "PM-31", title: "Bulk invoice export", step: "Spec", owner: TF, settled: "approved" },
      { key: "PM-28", title: "Onboarding checklist v2", step: "Criteria", owner: TF, settled: "approved" },
      { key: "PM-22", title: "Keep CSV as the export format", step: "Decision", owner: person(PEOPLE.maya), settled: "memory" },
      { key: "PM-26", title: "Pricing page experiment", step: "Breakdown", owner: TF, settled: "approved" },
      { key: "PM-19", title: "Search in the customer portal", step: "Build", owner: agent(AGENTS.claude), settled: "pr" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    href: "/solutions/operations",
    runs: [
      { key: "OP-8", title: "Postmortem: invoice job timeout", step: "Postmortem", owner: TF, settled: "approved" },
      { key: "OP-6", title: "Update the deploy runbook", step: "Runbook", owner: TF, settled: "approved" },
      { key: "OP-5", title: "Rotate the Q3 API keys", step: "Assign", owner: person(PEOPLE.leo), settled: "assigned" },
      { key: "OP-4", title: "Alert on failed webhooks", step: "Build", owner: agent(AGENTS.claude), settled: "pr" },
      { key: "OP-2", title: "On-call handover notes", step: "Summary", owner: person(PEOPLE.sam), settled: "memory" },
    ],
  },
  {
    id: "client-services",
    label: "Client services",
    href: "/solutions/client-services",
    runs: [
      { key: "CS-12", title: "Weekly status report for Acme", step: "Report", owner: TF, settled: "approved" },
      { key: "CS-10", title: "Onboarding plan for Globex", step: "Plan", owner: TF, settled: "approved" },
      { key: "CS-9", title: "Scope change from Initech", step: "Spec", owner: TF, settled: "approved" },
      { key: "CS-7", title: "Answer a data residency question", step: "Answer", owner: person(PEOPLE.sam), settled: "memory" },
      { key: "CS-3", title: "Invoice export for Acme", step: "Build", owner: agent(AGENTS.copilot), settled: "shipped" },
    ],
  },
];

/** 0 = le travail tourne, 1 = attend un humain, 2 = approuvé, rangé. */
type Phase = 0 | 1 | 2;
/** Durée de chaque phase (ms). 1 run = ~5 s, lisible sans être lent. */
const PHASE_MS: Record<Phase, number> = { 0: 1700, 1: 2000, 2: 1400 };

function useInViewReduced(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return { inView, reduced };
}

/**
 * La boucle : `head` tourne sur les 5 runs du rôle, le run `head` est en tête et en direct.
 * Affichage : ligne i = queue[(head - i) mod 5], où queue = [r0, r4, r3, r2, r1] ; au départ on
 * lit donc r0..r4 dans l'ordre d'écriture, puis la ligne du bas remonte en tête comme nouveau run.
 */
function useRunLoop(ref: RefObject<HTMLElement | null>) {
  const { inView, reduced } = useInViewReduced(ref);
  const [head, setHead] = useState(0);
  const [phase, setPhase] = useState<Phase>(1);
  useEffect(() => {
    if (!inView || reduced) return;
    const t = window.setTimeout(() => {
      if (phase === 2) {
        setHead((h) => (h + 1) % 5);
        setPhase(0);
      } else {
        setPhase((phase + 1) as Phase);
      }
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(t);
  }, [inView, reduced, phase, head]);
  return { head, phase };
}

const SETTLED: Record<Settled, { label: string; icon: typeof Check; tone: string }> = {
  approved: { label: "Approved", icon: Check, tone: "text-emerald-700 bg-emerald-500/10" },
  shipped: { label: "Shipped", icon: Check, tone: "text-emerald-700 bg-emerald-500/10" },
  pr: { label: "PR opened", icon: GitPullRequest, tone: "text-foreground/75 bg-secondary" },
  assigned: { label: "Assigned", icon: UserCheck, tone: "text-foreground/75 bg-secondary" },
  memory: { label: "Saved to Memory", icon: Brain, tone: "text-foreground/75 bg-secondary" },
};

function Avatar({ p, brand = false }: { p: Person; brand?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
        brand ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70 border",
      )}
    >
      {p.initials}
    </span>
  );
}

function OwnerCell({ owner }: { owner: Owner }) {
  if (owner.kind === "taskforce") {
    return (
      <span className="flex items-center gap-2">
        <img src="/logo-taskforce.svg" alt="" className="size-4 shrink-0" />
        <span className="truncate">TaskForce</span>
      </span>
    );
  }
  if (owner.kind === "agent") {
    return (
      <span className="flex items-center gap-2">
        <BrandLogo brand={owner.agent.logo} label="" className="size-4 shrink-0" loading="eager" />
        <span className="truncate">{owner.agent.name}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Avatar p={owner.person} />
      <span className="truncate">{owner.person.name}</span>
    </span>
  );
}

/** Libellé du travail en cours, selon qui le porte. */
function workingLabel(run: Run) {
  if (run.owner.kind === "agent") return `${run.owner.agent.name} is building`;
  if (run.owner.kind === "person") return "Matching skills";
  return `Drafting ${run.step.toLowerCase()}`;
}

function StatusPill({ run, live, phase }: { run: Run; live: boolean; phase: Phase }) {
  const base = "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap";
  if (live && phase === 0) {
    return (
      <span className={cn(base, "text-primary bg-primary/[0.08]")}>
        <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
        {workingLabel(run)}
      </span>
    );
  }
  if (live && phase === 1) {
    return (
      <span className={cn(base, "bg-amber-500/12 pl-1 text-amber-800")}>
        <Avatar p={PEOPLE.you} brand />
        Awaiting your approval
      </span>
    );
  }
  const s = SETTLED[run.settled];
  const Icon = s.icon;
  return (
    <span className={cn(base, s.tone, live && "animate-in fade-in-0 zoom-in-95 duration-300")}>
      <Icon aria-hidden className="size-3" strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

function RunsFrame({ role }: { role: Role }) {
  const ref = useRef<HTMLDivElement>(null);
  const { head, phase } = useRunLoop(ref);
  const queue = [role.runs[0], role.runs[4], role.runs[3], role.runs[2], role.runs[1]];
  const rows = [0, 1, 2, 3, 4].map((i) => queue[(((head - i) % 5) + 5) % 5]);

  return (
    <div
      ref={ref}
      className="bg-card overflow-hidden rounded-2xl border shadow-xl ring-1 ring-black/[0.03]"
    >
      {/* Barre du workspace : où on est, que c'est en direct, et l'argument « tes modèles ». */}
      <div className="bg-secondary/50 flex items-center gap-3 border-b px-4 py-2.5">
        <span className="bg-foreground text-background inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold">
          {WORKSPACE.initial}
        </span>
        <span className="text-foreground truncate text-[13px] font-medium">{WORKSPACE.name}</span>
        <span className="text-muted-foreground hidden text-[13px] sm:inline">/</span>
        <span className="text-foreground/80 hidden items-center gap-1.5 text-[13px] sm:flex">
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          Delivery runs
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-primary bg-primary/[0.07] hidden items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium md:inline-flex">
            <Sparkles aria-hidden className="size-3" />
            Runs on your models
          </span>
          <span className="text-muted-foreground text-[11.5px]">Illustrative</span>
        </span>
      </div>

      <table className="w-full table-fixed border-collapse text-left text-[13px]">
        <caption className="sr-only">
          Illustrative delivery runs for the {role.label.toLowerCase()} team of {WORKSPACE.name}
        </caption>
        {/* Largeurs posées sur les <th> (table-fixed les lit sur la 1re ligne) : une colonne masquée
            en `display:none` disparaît alors vraiment, ce que ne garantit pas un <col> masqué. */}
        <thead>
          <tr className="text-muted-foreground border-b text-[12px]">
            <th scope="col" className="px-4 py-2.5 font-medium">Run</th>
            <th scope="col" className="hidden w-[110px] px-3 py-2.5 font-medium md:table-cell">Step</th>
            <th scope="col" className="hidden w-[180px] px-3 py-2.5 font-medium lg:table-cell">Owner</th>
            <th scope="col" className="hidden w-[210px] px-4 py-2.5 font-medium sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((run, i) => {
            const live = i === 0;
            return (
              <tr
                key={live ? `${run.key}:live:${head}` : `${run.key}:done`}
                className={cn(
                  "border-b last:border-b-0",
                  live && "bg-primary/[0.025] animate-in fade-in-0 slide-in-from-top-2 duration-500",
                )}
              >
                <td className="px-4 py-3">
                  <span className="flex min-w-0 items-baseline gap-2.5">
                    <span className="text-muted-foreground shrink-0 font-mono text-[12px]">{run.key}</span>
                    <span className="text-foreground truncate font-medium">{run.title}</span>
                  </span>
                  {/* Mobile : le statut passe sous le titre, qui garde toute la largeur. */}
                  <span className="mt-2 flex sm:hidden">
                    <StatusPill run={run} live={live} phase={phase} />
                  </span>
                </td>
                <td className="text-muted-foreground hidden px-3 py-3 md:table-cell">{run.step}</td>
                <td className="text-foreground/80 hidden px-3 py-3 lg:table-cell">
                  <OwnerCell owner={run.owner} />
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <StatusPill run={run} live={live} phase={phase} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pied : la règle du produit, rappelée par l'état de la boucle, et la porte vers la page métier. */}
      <div className="bg-secondary/40 flex items-center justify-between gap-4 border-t px-4 py-2.5 text-[12.5px]">
        <span className="text-muted-foreground flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", phase === 1 ? "bg-amber-500" : "bg-emerald-500")}
          />
          {phase === 1 ? "1 run waiting on a human" : "Every step waits for a human sign-off"}
        </span>
        <a href={role.href} className="link-underline text-foreground inline-flex items-center gap-1 font-medium">
          How {role.label.toLowerCase()} teams use it
          <ArrowRight aria-hidden className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

export default function HeroRuns() {
  const [role, setRole] = useState(ROLES[0].id);
  return (
    <Tabs value={role} onValueChange={setRole} className="gap-4">
      {/* Sous ~460 px les 4 onglets ne tiennent pas : défilement horizontal, et un fondu à droite
          dit qu'il y en a d'autres. Au-delà, ils tiennent et le fondu disparaît. */}
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] max-[460px]:[mask-image:linear-gradient(to_right,#000_78%,transparent)] [&::-webkit-scrollbar]:hidden">
        <TabsList aria-label="See TaskForce run for a team" className="bg-secondary h-10 justify-start border">
          {ROLES.map((r) => (
            <TabsTrigger key={r.id} value={r.id} className="px-2.5 text-[13px] sm:px-3.5 sm:text-[13.5px]">
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {ROLES.map((r) => (
        <TabsContent key={r.id} value={r.id}>
          <RunsFrame role={r} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
