"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Bouton (×) sur CHAQUE toast : sans lui, impossible de fermer à la main (surtout les toasts
      // persistants / empilés) - on attendait l'auto-dismiss ou on restait coincé.
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      // `pointer-events-auto` sur CHAQUE toast : quand un sheet/dialog Radix modal est ouvert (ex.
      // l'issue-sheet), Radix pose `body { pointer-events: none }` → le portail sonner (dans le body)
      // devenait NON cliquable (× injoignable). On réactive les événements au niveau du toast.
      toastOptions={{ className: "pointer-events-auto" }}
      {...props}
    />
  )
}

export { Toaster }
