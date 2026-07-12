"use client"

import * as React from "react"
import Link from "next/link"
import { Lock } from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { Button } from "@/components/ui/button"

type Plan = "FREE" | "PRO" | "ENTERPRISE"

const PLAN_RANK: Record<Plan, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
}

interface PlanGateProps {
  /** Minimum plan required (inclusive). */
  readonly minPlan?: Plan
  /** Explicit list of allowed plans (overrides minPlan). */
  readonly plans?: readonly Plan[]
  readonly children: React.ReactNode
  /** Optional custom fallback. Defaults to upgrade CTA card. */
  readonly fallback?: React.ReactNode
}

/**
 * Renders children only if the authenticated user's plan meets the requirement.
 * Otherwise renders an upgrade CTA (or a custom fallback).
 *
 * Usage:
 *   <PlanGate minPlan="pro">
 *     <AnalyticsDashboard />
 *   </PlanGate>
 *
 *   <PlanGate plans={["enterprise"]}>
 *     <AdminPanel />
 *   </PlanGate>
 */
export function PlanGate({ minPlan, plans, children, fallback }: PlanGateProps) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)

  const userPlan: Plan = (user?.planType as Plan) ?? "FREE"

  const hasAccess = (() => {
    if (plans) {
      return plans.includes(userPlan)
    }
    if (minPlan) {
      return PLAN_RANK[userPlan] >= PLAN_RANK[minPlan]
    }
    return true
  })()

  if (hasAccess) return <>{children}</>

  if (fallback) return <>{fallback}</>

  const requiredPlan = plans ? plans[0] : minPlan ?? "pro"

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{t("common.comingSoon")}</p>
        <p className="text-sm text-muted-foreground">
          {t("common.upgrade")} •{" "}
          <span className="capitalize font-medium">{requiredPlan}</span>
        </p>
      </div>
      <Button size="sm" asChild>
        <Link href={`/${slug}/billing`}>{t("common.learnMore")}</Link>
      </Button>
    </div>
  )
}
