"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation } from "@/lib/i18n"

function setThemeWithCircle(
  setTheme: (theme: string) => void,
  theme: string,
  event: React.MouseEvent
) {
  const x = event.clientX
  const y = event.clientY
  const root = document.documentElement
  root.style.setProperty("--theme-x", `${x}px`)
  root.style.setProperty("--theme-y", `${y}px`)

  if (!(document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition) {
    setTheme(theme)
    return
  }
  ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
    setTheme(theme)
  })
}

export function ThemeToggle() {
  const { setTheme } = useTheme()
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("accessibility.toggleTheme")}
          className="relative"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={(e) => setThemeWithCircle(setTheme, "light", e)}>
          <Sun className="mr-2 size-4" />
          {t("common.light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => setThemeWithCircle(setTheme, "dark", e)}>
          <Moon className="mr-2 size-4" />
          {t("common.dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => setThemeWithCircle(setTheme, "system", e)}>
          <Monitor className="mr-2 size-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
