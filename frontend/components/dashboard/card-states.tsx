"use client"

import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/** Squelette de chargement d'un corps de carte. */
export function CardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="min-h-16 w-full flex-1" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

/** État vide honnête, centré et gris (façon « Not enough data » de Cloudflare). */
export function CardEmpty({ message = "Not enough data" }: { readonly message?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center">
      <p className="text-xs text-muted-foreground/60">{message}</p>
    </div>
  )
}

/** Erreur de chargement : message court + réessai (jamais de spinner infini). */
export function CardError({
  onRetry,
  message = "Data unavailable",
}: {
  readonly onRetry: () => void
  readonly message?: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onRetry}>
        <RefreshCw className="size-3" /> Retry
      </Button>
    </div>
  )
}
