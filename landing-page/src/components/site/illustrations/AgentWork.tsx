import {
  Check,
  FileCode2,
  FilePlus2,
  FileSearch,
  FlaskConical,
  GitPullRequest,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AppWindow, PersonChip } from "../scene/AppWindow";
import { BrandLogo } from "../BrandLogo";
import { useScene } from "@/lib/useScene";
import { AGENTS, AGENT_STEPS, BREAKDOWN, PEOPLE, PROJECT, WORKSPACE, type AgentStep } from "@/lib/story";
import { cn } from "@/lib/utils";

/**
 * AgentWork — SCÈNE 3 : « et voilà ce que l'agent a fait, ligne par ligne ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VEND
 * ─────────────────────────────────────────────────────────────────────────────
 * Déléguer à un agent n'a d'intérêt que si on peut **relire** ce qu'il a fait.
 * La vue ne montre donc pas « une IA travaille » — elle montre des faits
 * vérifiables : un fichier, un diff chiffré, un résultat de tests, un numéro de
 * PR. Rien qui ne puisse être ouvert et contredit.
 *
 * MOMENT « AHA » : l'étape qui édite `InvoiceExportService.java` porte le badge
 * **criterion 4**. L'agent travaille littéralement sur la ligne que **vous** avez
 * exigée au checkpoint de la scène 1. La boucle demande → refus → critère →
 * issue → agent → PR se referme sous les yeux.
 *
 * ET LE POINT ESSENTIEL : la PR ne part pas en production. Elle revient en revue.
 * L'agent est un contributeur de plus, pas une dérogation au processus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PARTITION (une étape ~1,1 s, puis 3 s de pause — la scène BOUCLE)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STEP_MS = 1100;
const BEATS = [800, ...AGENT_STEPS.map(() => STEP_MS)] as const;
/** Battement à partir duquel la première étape est visible. */
const FIRST = 1;

const ICON: Record<AgentStep["verb"], typeof FileCode2> = {
  Read: FileSearch,
  Search: Search,
  Edit: FileCode2,
  Create: FilePlus2,
  Test: FlaskConical,
  Scan: ShieldCheck,
  Open: GitPullRequest,
};

const task = BREAKDOWN[1]; // CP-41 — l'issue née du commentaire humain.

export function AgentWork() {
  const scene = useScene(BEATS, { loopAfter: 3000 });

  const shown = Math.max(0, scene.beat - FIRST + 1);
  const finished = shown >= AGENT_STEPS.length;

  return (
    <div ref={scene.ref}>
      <AppWindow breadcrumb={[WORKSPACE.name, "Operations", PROJECT, task.key]}>
        {/* En-tête : qui travaille, sur quoi, et pour qui. */}
        <div className="flex items-center gap-2.5 border-b border-[#eeeef1] px-4 py-2.5">
          <BrandLogo brand={AGENTS.claude.logo} label="" className="size-[18px] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-foreground">
              {AGENTS.claude.name}
              <span className="text-muted-foreground font-normal"> · {task.key}</span>
            </p>
            <p className="text-muted-foreground truncate text-[10.5px]">{task.title}</p>
          </div>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10.5px] font-medium transition-colors duration-500",
              finished
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-[#e6e6ea] bg-[#fafafb] text-muted-foreground",
            )}
          >
            {finished ? (
              <Check className="size-2.5" strokeWidth={3.5} />
            ) : (
              <Loader2 className="text-primary size-2.5 animate-spin" />
            )}
            {finished ? "Ready for review" : "Working"}
          </span>
        </div>

        {/* Le journal. `min-h` réserve les 7 lignes : rien ne pousse en arrivant. */}
        <ul className="min-h-[214px] px-4 py-2.5">
          {AGENT_STEPS.map((s, i) => {
            const visible = i < shown;
            const running = i === shown - 1 && !finished;
            const Icon = ICON[s.verb];

            return (
              <li
                key={s.target}
                className={cn(
                  "flex items-center gap-2.5 py-[5px] transition-all duration-400",
                  visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                )}
              >
                <span
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-md",
                    running ? "bg-primary/10 text-primary" : "bg-[#f2f2f5] text-muted-foreground",
                  )}
                >
                  {running ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : (
                    <Icon className="size-3" strokeWidth={1.9} />
                  )}
                </span>

                <span className="text-muted-foreground w-[46px] shrink-0 text-[10.5px]">
                  {s.verb}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                  {s.target}
                </span>

                {s.criterion && (
                  <span className="hidden shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-px font-mono text-[9px] text-emerald-700 sm:inline">
                    criterion {s.criterion}
                  </span>
                )}
                {/* Les gates (tests, sécu) passent en vert une fois franchies — c'est ce
                    que tout le monde veut voir avant de laisser un agent livrer. */}
                <span
                  className={cn(
                    "w-[118px] shrink-0 text-right font-mono text-[9.5px]",
                    s.gate && visible && !running
                      ? "flex items-center justify-end gap-1 text-emerald-700"
                      : "text-muted-foreground",
                  )}
                >
                  {s.gate && visible && !running && <Check className="size-2.5" strokeWidth={3} />}
                  {s.detail}
                </span>
              </li>
            );
          })}
        </ul>

        {/* La sortie : une PR, et un checkpoint qui vous revient. */}
        <div
          className={cn(
            "flex items-center gap-2.5 border-t border-[#e9e9ed] bg-[#fcfcfd] px-4 py-2.5 transition-opacity duration-500",
            finished ? "opacity-100" : "opacity-0",
          )}
        >
          <GitPullRequest className="size-3.5 shrink-0 text-emerald-600" />
          <p className="min-w-0 text-[11.5px] text-foreground">
            <span className="font-medium">PR #284 opened</span>
            <span className="text-muted-foreground hidden sm:inline">
              {" "}
              · it does not merge itself, it goes back through review
            </span>
          </p>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 md:flex">
            <span className="text-muted-foreground text-[10.5px]">Reviewer</span>
            <PersonChip person={PEOPLE.leo} />
          </span>
        </div>
      </AppWindow>
    </div>
  );
}
