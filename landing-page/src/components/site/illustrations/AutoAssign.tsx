import { Check, Loader2, Sparkles, X } from "lucide-react";
import { AppWindow, Cursor, PersonChip } from "../scene/AppWindow";
import { BrandLogo } from "../BrandLogo";
import { useScene } from "@/lib/useScene";
import { BREAKDOWN, PROJECT, WORKSPACE, type Task } from "@/lib/story";
import { cn } from "@/lib/utils";

/**
 * AutoAssign — SCÈNE 2 : « le découpage part vers les bonnes personnes, dont un agent ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VEND
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est ici que bascule tout l'argument. Jusqu'à ce plan, TaskForce écrit des
 * documents. À partir de ce plan, il **distribue du travail** — et un agent de
 * code y est un assigné comme un autre : même carte, même colonne, même
 * checkpoint de revue. Ce n'est pas « une IA en plus », c'est un membre d'équipe
 * de plus dans un système qui savait déjà répartir le travail.
 *
 * MOMENT « AHA » : la ligne où le nom d'une personne est remplacé par **Claude
 * Code**, avec la raison écrite à côté (« Léo est à 92 % de charge »). On ne
 * remplace personne : on donne à la machine ce que personne n'avait le temps de
 * prendre.
 *
 * CONTINUITÉ : `CP-41` sort du **critère 4**, celui né du commentaire humain de
 * la scène 1. La chaîne demande → refus → critère → issue → agent est lisible de
 * bout en bout, et c'est ce qui rend la démonstration crédible.
 *
 * L'écran est le vrai : la modale **Smart Assign** existe déjà dans le produit
 * (« Recommandations basées sur compétences, charge et disponibilité »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PARTITION (10,3 s, puis 2,5 s de pause — la scène BOUCLE)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1,0 s  les 4 issues du découpage tombent une à une, non assignées
 *  3,0 s  le curseur va sur `Auto-assign (4)` et clique
 *  4,0 s  la modale s'ouvre, elle réfléchit
 *  5,1 s  les 4 recommandations apparaissent, dont **2 pour Claude Code**
 *  7,3 s  clic sur `Assign`
 *  8,2 s  la modale se ferme, les 4 cartes portent leur assigné
 */

const BEATS = [1000, 500, 500, 1000, 1000, 1100, 2200, 900, 2100] as const;
const B_TASK1 = 1;
const B_TASK2 = 2;
const B_TASK3 = 3;
const B_CURSOR = 4;
const B_MODAL = 5;
const B_RECO = 6;
const B_ASSIGN = 7;
const B_DONE = 8;

const AT_BUTTON = { left: "84%", top: "13%" };
const AT_ASSIGN = { left: "62%", top: "78%" };

export function AutoAssign() {
  const scene = useScene(BEATS, { loopAfter: 2500 });

  const shown = Math.min(BREAKDOWN.length, Math.max(0, scene.beat));
  const modalOpen = scene.at(B_MODAL) && !scene.at(B_DONE);
  const assigned = scene.at(B_DONE);

  return (
    <div ref={scene.ref}>
      <AppWindow
        breadcrumb={[WORKSPACE.name, "Operations", PROJECT]}
        footer={
          <Cursor
            left={scene.at(B_MODAL) ? AT_ASSIGN.left : AT_BUTTON.left}
            top={scene.at(B_MODAL) ? AT_ASSIGN.top : AT_BUTTON.top}
            visible={scene.at(B_CURSOR) && !scene.at(B_DONE)}
            clicking={scene.beat === B_MODAL || scene.beat === B_ASSIGN}
          />
        }
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              Breakdown · from the spec you approved
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Every issue carries the acceptance criterion it came from.
            </p>
          </div>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-[5px] text-[11.5px] font-medium transition-colors duration-300",
              assigned
                ? "bg-[#f0f0f3] text-muted-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            <Sparkles className="size-3" />
            {assigned ? "All assigned" : `Auto-assign (${BREAKDOWN.length})`}
          </span>
        </div>

        {/* min-h : les 4 lignes sont réservées dès le départ, elles ne poussent rien. */}
        <ul className="min-h-[204px] px-4 pb-4">
          {BREAKDOWN.map((t, i) => (
            <TaskRow key={t.key} task={t} visible={i < shown} assigned={assigned} />
          ))}
        </ul>

        <SmartAssignModal open={modalOpen} showReco={scene.at(B_RECO)} />
      </AppWindow>
    </div>
  );
}

/* ─────────────────────────  Une ligne d'issue  ───────────────────────── */

function TaskRow({ task, visible, assigned }: { task: Task; visible: boolean; assigned: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-[#f2f2f5] py-[9px] transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
      )}
    >
      <span className="text-muted-foreground w-[42px] shrink-0 font-mono text-[10px]">
        {task.key}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{task.title}</span>

      {/* Le lien vers la spec — c'est ce qui rend la chaîne vérifiable. */}
      <span
        className={cn(
          "hidden shrink-0 rounded border px-1.5 py-px font-mono text-[9px] md:inline",
          task.from === 4
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-[#e9e9ed] bg-[#fafafb] text-muted-foreground",
        )}
      >
        criterion {task.from}
      </span>

      <span className="text-muted-foreground w-[34px] shrink-0 text-right font-mono text-[10px]">
        {task.points} pts
      </span>

      {/* Exécutant + reviewer. Largeur figée pour ne rien décaler à l'assignation. */}
      <span className="flex w-[210px] shrink-0 items-center justify-end gap-2">
        {assigned ? (
          <>
            {task.agent === true ? (
              <span className="flex items-center gap-1.5 rounded-full border border-[#e2e2e8] bg-white py-[2px] pr-2 pl-1">
                <BrandLogo brand={task.assignee.logo} label="" className="size-[15px]" />
                <span className="truncate text-[10.5px] font-medium text-foreground">
                  {task.assignee.name}
                </span>
              </span>
            ) : (
              <PersonChip person={task.assignee} />
            )}
            {/* Le reviewer — toujours un humain, même quand l'exécutant est un agent. */}
            <span className="hidden items-center gap-1 md:flex" title={`Reviewed by ${task.reviewer.name}`}>
              <span className="text-muted-foreground/50 text-[9.5px]">review</span>
              <PersonChip person={task.reviewer} withName={false} />
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/50 rounded-full border border-dashed border-[#dcdce2] px-2 py-[2px] text-[10.5px]">
            Unassigned
          </span>
        )}
      </span>
    </li>
  );
}

/* ─────────────────────────  La modale Smart Assign  ───────────────────────── */

/** Reprise du vrai écran : titre, phrase d'explication, liste à décocher, Cancel / Assign. */
function SmartAssignModal({ open, showReco }: { open: boolean; showReco: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center px-6 transition-opacity duration-300",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ background: "rgba(16,24,40,0.22)" }}
    >
      <div
        className={cn(
          "w-full max-w-[440px] rounded-xl border border-[#dcdce2] bg-white transition-all duration-300",
          open ? "translate-y-0 scale-100" : "translate-y-2 scale-[0.98]",
        )}
        style={{ boxShadow: "0 24px 60px -20px rgba(16,24,40,0.40)" }}
      >
        <div className="flex items-start gap-2 px-4 pt-3.5">
          <Sparkles className="text-primary mt-[3px] size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Smart Assign — 4 issues</p>
            <p className="text-muted-foreground mt-0.5 text-[11px] leading-[16px]">
              Recommendations based on skills, load and availability. Uncheck any you want to keep
              for a human.
            </p>
          </div>
          <X className="text-muted-foreground/50 size-3.5 shrink-0" />
        </div>

        {/* min-h : le spinner et la liste occupent la même place. */}
        <div className="mt-3 min-h-[188px] px-4">
          {!showReco ? (
            <div className="flex h-[188px] items-center justify-center">
              <Loader2 className="text-muted-foreground/50 size-5 animate-spin" />
            </div>
          ) : (
            <ul className="flex flex-col">
              {BREAKDOWN.map((t, i) => (
                <li
                  key={t.key}
                  className="anim-rise flex items-start gap-2.5 border-b border-[#f2f2f5] py-2 last:border-0"
                  style={{ "--rise-delay": `${i * 90}ms` } as React.CSSProperties}
                >
                  <span className="bg-primary mt-[3px] flex size-[13px] shrink-0 items-center justify-center rounded-[3px] text-white">
                    <Check className="size-2.5" strokeWidth={4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted-foreground shrink-0 font-mono text-[9.5px]">
                        {t.key}
                      </span>
                      {t.agent === true ? (
                        <span className="flex items-center gap-1">
                          <BrandLogo brand={t.assignee.logo} label="" className="size-[13px]" />
                          <span className="text-[11.5px] font-medium text-foreground">
                            {t.assignee.name}
                          </span>
                          <span className="rounded bg-[color:var(--site-ai-soft)] px-1 text-[8.5px] font-semibold tracking-wide text-[color:var(--site-ai)] uppercase">
                            agent
                          </span>
                        </span>
                      ) : (
                        <PersonChip person={t.assignee} />
                      )}
                    </span>
                    {/* La raison + le reviewer. Sans la raison c'est un oracle ; avec
                        elle c'est un outil. Le reviewer dit que rien ne ship sans humain. */}
                    <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[10px]">
                      <span className="truncate">{t.why}</span>
                      <span className="text-muted-foreground/40 shrink-0">·</span>
                      <span className="flex shrink-0 items-center gap-1">
                        review
                        <PersonChip person={t.reviewer} withName={false} />
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3">
          <span className="text-muted-foreground rounded-md border border-[#e0e0e6] px-2.5 py-[5px] text-[11px]">
            Cancel
          </span>
          <span className="bg-primary text-primary-foreground rounded-md px-3 py-[5px] text-[11px] font-medium">
            Assign
          </span>
        </div>
      </div>
    </div>
  );
}
