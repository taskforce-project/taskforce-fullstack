"use client";

import Image from "next/image";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

/**
 * Coquille de l'onboarding - donne au wizard l'allure exacte de l'application.
 *
 * <p>Le reproche initial (« j'ai l'impression d'avoir quitté TaskForce ») venait d'une carte flottante
 * sur page vide. On reprend le <b>vrai composant `Sidebar` de l'app</b> (mêmes jetons, même largeur) et,
 * après un essai « sidebar vide » jugé trop creux, on la <b>remplit avec les étapes</b> - via les vraies
 * primitives `SidebarMenu`/`SidebarMenuButton`, donc rendu 100 % natif (fond actif `sidebar-accent`,
 * survol, etc.), pas un stepper custom. Marque en haut, compte en bas, comme le châssis Linear demandé.</p>
 *
 * <p><b>Alignement des bordures</b> : en-tête sidebar & topbar en {@code h-14}, pied sidebar & footer en
 * {@code h-16} → les traits se prolongent d'un bloc à l'autre ({@code --border} == {@code --sidebar-border}).</p>
 *
 * <p>Le contenu de l'étape est <b>centré verticalement</b> (il s'étire au besoin puis défile) pour éviter
 * le grand vide sous les étapes courtes. Couleurs 100 % système de l'app (primaire bleu, aucun violet).</p>
 */
export interface OnboardingShellProps {
  readonly steps: readonly string[];
  /** Étape courante (1-based). */
  readonly current: number;
  /** Étape la plus avancée atteinte (1-based) - on ne peut sauter que jusqu'à elle. */
  readonly maxReached: number;
  readonly onSelectStep: (step: number) => void;
  readonly account: { readonly name: string; readonly email: string; readonly avatarUrl: string };
  /** Contenu de l'étape courante. */
  readonly children: React.ReactNode;
  /** Barre d'actions (Précédent / Suivant / Terminer), ancrée en bas du canevas. */
  readonly footer: React.ReactNode;
}

const LOGO_SRC = "/assets/logo/logo_taskforce_tp.png";

/** Lockup de marque : le mark seul rendait mal en petit → on l'accompagne du mot « TaskForce ». */
function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5">
      <Image src={LOGO_SRC} alt="" width={144} height={94} priority className="h-9 w-auto dark:invert" />
      <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">TaskForce</span>
    </div>
  );
}

export function OnboardingShell({
  steps,
  current,
  maxReached,
  onSelectStep,
  account,
  children,
  footer,
}: OnboardingShellProps) {
  return (
    <SidebarProvider className="h-svh">
      {/* ── Sidebar RÉELLE de l'app : marque · étapes · compte ────────────────────── */}
      <Sidebar collapsible="none" className="max-md:hidden border-r border-sidebar-border">
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4 py-0">
          <BrandLockup />
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          <SidebarGroup className="py-0">
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarMenu>
              {steps.map((label, i) => {
                const n = i + 1;
                const done = n < current;
                const isCurrent = n === current;
                const reachable = n <= maxReached && !isCurrent;
                return (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton
                      isActive={isCurrent}
                      disabled={!reachable && !isCurrent}
                      onClick={() => reachable && onSelectStep(n)}
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : isCurrent
                              ? "border-primary text-primary"
                              : "border-border text-muted-foreground"
                        )}
                      >
                        {done ? <Check className="size-3" strokeWidth={3} /> : n}
                      </span>
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="h-16 justify-center border-t border-sidebar-border px-2 py-0">
          {/* Miroir visuel de NavUser (compte en bas), non interactif : rien à naviguer pendant le setup. */}
          <div className="flex items-center gap-2 rounded-md p-2">
            <UserAvatar
              email={account.email}
              name={account.name}
              avatarUrl={account.avatarUrl}
              className="size-8"
            />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-sidebar-foreground">{account.name}</span>
              <span className="truncate text-xs text-muted-foreground">{account.email}</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* ── Canevas principal : topbar · contenu centré · footer ──────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center border-b border-border px-4 md:px-6">
          {/* Mobile : la sidebar est masquée → marque + position ici. */}
          <div className="flex items-center gap-2 md:hidden">
            <Image src={LOGO_SRC} alt="" width={96} height={62} priority className="h-6 w-auto dark:invert" />
          </div>
          {/* Fil d'Ariane, façon AppTopbar. */}
          <div className="hidden items-center gap-1.5 text-sm md:flex">
            <span className="text-muted-foreground">Configuration</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-medium text-foreground">{steps[current - 1]}</span>
          </div>
          <span className="ml-auto text-sm text-muted-foreground md:hidden">
            Step {current} / {steps.length}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-10 md:px-10">
            {children}
          </div>
        </div>

        {/* Footer ancré - même hauteur que la barre profil pour que les bordures s'alignent. */}
        <div className="flex h-16 shrink-0 items-center border-t border-border px-6 md:px-10">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between">{footer}</div>
        </div>
      </main>
    </SidebarProvider>
  );
}
