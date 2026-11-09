"use client"

import type { ReactNode } from "react"

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const CHIP =
  "flex h-6 min-w-0 max-w-48 items-center gap-1 rounded px-1 text-xs transition-colors duration-150 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground motion-reduce:transition-none"

/**
 * Un choix de la rangée sous la boîte (R134, R135) : 24 px de haut, du texte de 12 px, sans bordure, et sa liste au-dessus,
 * une ligne de 32 px par choix. Le clavier d'abord : les flèches parcourent, une lettre saute, Échap referme.
 */
export function RowMenu({ label, menuLabel, trigger, children }: Readonly<{
  /** Le nom du bouton, au survol et pour un lecteur d'écran. */
  label: string
  /** Le nom de la liste. */
  menuLabel: string
  trigger: ReactNode
  children: ReactNode
}>) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={label} title={label} className={CHIP}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        aria-label={menuLabel}
        className="max-h-80 w-[260px] max-w-[calc(100vw-2rem)] motion-reduce:!animate-none"
        onCloseAutoFocus={(event) => {
          // Le champ reprend le curseur : c'est là que la personne continue d'écrire.
          event.preventDefault()
          document.getElementById("command-bar-input")?.focus()
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Une ligne de 32 px. */
export function RowMenuItem({ onSelect, children }: Readonly<{ onSelect: () => void; children: ReactNode }>) {
  return (
    <DropdownMenuItem className="h-8" onSelect={onSelect}>
      {children}
    </DropdownMenuItem>
  )
}

export function RowMenuSeparator() {
  return <DropdownMenuSeparator />
}
