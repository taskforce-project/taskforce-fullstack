"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
 * <p><b>Mobile</b> : la sidebar desktop est masquée (`max-md:hidden`). La topbar porte alors un bouton
 * <b>menu</b> (libellé = étape courante) qui ouvre les étapes dans un <b>overlay `Sheet`</b> - il ne prend
 * pas la place du contenu (contrairement à une sidebar toujours ouverte, qui ne laisserait plus de place
 * pour l'étape). La pastille d'étape est partagée entre les deux rendus.</p>
 *
 * <p>Le contenu de l'étape est <b>centré verticalement</b> par `my-auto` (il défile depuis le haut quand
 * il dépasse la hauteur visible, au lieu de rogner son début sur petit écran).</p>
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

/** Pastille numérotée d'étape (partagée : sidebar desktop + menu mobile). */
function StepBadge({ n, done, isCurrent }: { readonly n: number; readonly done: boolean; readonly isCurrent: boolean }) {
  return (
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SidebarProvider className="h-svh">
      {/* ── Sidebar RÉELLE de l'app (desktop) : marque · étapes · compte ───────────── */}
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
                      <StepBadge n={n} done={done} isCurrent={isCurrent} />
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
            <UserAvatar email={account.email} name={account.name} avatarUrl={account.avatarUrl} className="size-8" />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-sidebar-foreground">{account.name}</span>
              <span className="truncate text-xs text-muted-foreground">{account.email}</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* ── Menu MOBILE : les mêmes étapes en overlay (n'occupe pas la place du contenu) ─── */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
          <SheetHeader className="h-14 shrink-0 justify-center border-b border-sidebar-border px-4 py-0">
            <SheetTitle className="flex items-center gap-2.5 text-left text-base">
              <Image src={LOGO_SRC} alt="" width={96} height={62} className="h-6 w-auto dark:invert" />
              TaskForce
            </SheetTitle>
            <SheetDescription className="sr-only">Onboarding steps and your account.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-2 py-3">
            <p className="px-2.5 pb-2 text-xs font-medium text-muted-foreground">Configuration</p>
            <nav className="flex flex-col gap-0.5">
              {steps.map((label, i) => {
                const n = i + 1;
                const done = n < current;
                const isCurrent = n === current;
                const reachable = n <= maxReached && !isCurrent;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!reachable && !isCurrent}
                    onClick={() => {
                      if (reachable) {
                        onSelectStep(n);
                        setMenuOpen(false);
                      }
                    }}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      isCurrent
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : reachable
                          ? "text-sidebar-foreground hover:bg-sidebar-accent/50"
                          : "cursor-default text-muted-foreground/60"
                    )}
                  >
                    <StepBadge n={n} done={done} isCurrent={isCurrent} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex h-16 shrink-0 flex-col justify-center border-t border-sidebar-border px-2 py-0">
            <div className="flex items-center gap-2 p-2">
              <UserAvatar email={account.email} name={account.name} avatarUrl={account.avatarUrl} className="size-8" />
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-foreground">{account.name}</span>
                <span className="truncate text-xs text-muted-foreground">{account.email}</span>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Canevas principal : topbar · contenu centré · footer ──────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center border-b border-border px-4 md:px-6">
          {/* Mobile : bouton MENU (libellé = étape courante) qui ouvre les étapes en overlay. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open steps menu"
            className="-ml-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent md:hidden"
          >
            <Menu className="size-5 text-muted-foreground" aria-hidden />
            <span className="font-medium text-foreground">{steps[current - 1]}</span>
          </button>
          {/* Desktop : fil d'Ariane, façon AppTopbar. */}
          <div className="hidden items-center gap-1.5 text-sm md:flex">
            <span className="text-muted-foreground">Configuration</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-medium text-foreground">{steps[current - 1]}</span>
          </div>
          <span className="ml-auto text-sm text-muted-foreground md:hidden">
            {current} / {steps.length}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* `my-auto` (pas `justify-center`) : centre l'étape quand il y a la place, mais laisse
              défiler depuis le HAUT quand elle dépasse la hauteur visible (mobile / petits écrans),
              au lieu de rogner le début de l'étape. */}
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 py-8 sm:px-6 sm:py-10 md:px-10">
            <div className="my-auto w-full">{children}</div>
          </div>
        </div>

        {/* Footer ancré - même hauteur que la barre profil pour que les bordures s'alignent. */}
        <div className="flex h-16 shrink-0 items-center border-t border-border px-5 sm:px-6 md:px-10">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between">{footer}</div>
        </div>
      </main>
    </SidebarProvider>
  );
}
