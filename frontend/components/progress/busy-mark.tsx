"use client"

import { Loader2 } from "lucide-react"

import { Named } from "@/components/progress/named"

/**
 * Ce qui avance dans la ligne (R129) : un cercle qui tourne et « 3/8 » ; la phrase entière au survol. Elle est dite aux
 * lecteurs d'écran par un `role="status"` à part : le signe seul ne leur dirait rien.
 */
export function BusyMark({ short, text }: Readonly<{ short: string; text: string }>) {
  return (
    <>
      <Named name={text} wide>
        <span aria-hidden className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          {short}
        </span>
      </Named>
      <span role="status" className="sr-only">{text}</span>
    </>
  )
}
