"use client"


import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  FolderKanban,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  Plus,
  User,
  Bell,
  Zap,
  Sun,
  Moon,
  Search,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

interface CommandAction {
  id: string
  label: string
  group: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Readonly<CommandPaletteProps>) {
  const router = useRouter()
  const { setTheme } = useTheme()

  function go(path: string) {
    router.push(path)
    onOpenChange(false)
  }

  const ACTIONS: CommandAction[] = [
    // Navigation
    { id: "dashboard",    label: "Go to Dashboard",    group: "Navigation", icon: <LayoutDashboard className="h-4 w-4" />, shortcut: "G D", action: () => go("/dashboard") },
    { id: "inbox",        label: "Go to Inbox",         group: "Navigation", icon: <Inbox className="h-4 w-4" />,           shortcut: "G I", action: () => go("/inbox") },
    { id: "my-work",      label: "Go to My Work",       group: "Navigation", icon: <ClipboardCheck className="h-4 w-4" />, shortcut: "G W", action: () => go("/my-work") },
    { id: "projects",     label: "Go to Projects",      group: "Navigation", icon: <FolderKanban className="h-4 w-4" />,   shortcut: "G P", action: () => go("/projects") },
    { id: "teams",        label: "Go to Teams",         group: "Navigation", icon: <Users className="h-4 w-4" />,           shortcut: "G T", action: () => go("/teams") },
    { id: "analytics",   label: "Go to Analytics",     group: "Navigation", icon: <BarChart3 className="h-4 w-4" />,      shortcut: "G A", action: () => go("/analytics") },
    { id: "discussions",  label: "Go to Discussions",   group: "Navigation", icon: <MessageSquare className="h-4 w-4" />,  shortcut: "G M", action: () => go("/discussions") },
    { id: "settings",     label: "Go to Settings",      group: "Navigation", icon: <Settings className="h-4 w-4" />,       shortcut: "G S", action: () => go("/settings") },
    { id: "profile",      label: "View my profile",     group: "Navigation", icon: <User className="h-4 w-4" />,           shortcut: "G F", action: () => go("/profile") },
    // Actions
    { id: "new-issue",    label: "Create new issue",    group: "Actions",    icon: <Plus className="h-4 w-4" />,            shortcut: "C",   action: () => { onOpenChange(false); toast.info("New issue dialog coming soon") } },
    { id: "new-project",  label: "Create new project",  group: "Actions",    icon: <Plus className="h-4 w-4" />,                             action: () => go("/projects") },
    { id: "notifications",label: "Open notifications",  group: "Actions",    icon: <Bell className="h-4 w-4" />,            shortcut: "G I", action: () => go("/inbox") },
    { id: "upgrade",      label: "Upgrade to Pro",      group: "Actions",    icon: <Zap className="h-4 w-4" />,                              action: () => { go("/settings"); toast.info("Redirecting to Billing…") } },
    // Appearance
    {
      id: "theme-light",
      label: "Switch to light mode",
      group: "Appearance",
      icon: <Sun className="h-4 w-4" />,
      action: () => { setTheme("light"); onOpenChange(false) },
    },
    {
      id: "theme-dark",
      label: "Switch to dark mode",
      group: "Appearance",
      icon: <Moon className="h-4 w-4" />,
      action: () => { setTheme("dark"); onOpenChange(false) },
    },
    {
      id: "theme-system",
      label: "Use system theme",
      group: "Appearance",
      icon: <Search className="h-4 w-4" />,
      action: () => { setTheme("system"); onOpenChange(false) },
    },
  ]

  const groups = [...new Set(ACTIONS.map((a) => a.group))]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false} className="max-w-lg">
      <CommandInput placeholder="Search commands, pages, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {ACTIONS.filter((a) => a.group === group).map((action) => (
                <CommandItem key={action.id} onSelect={action.action} className="gap-3">
                  <span className="text-muted-foreground">{action.icon}</span>
                  {action.label}
                  {action.shortcut && (
                    <CommandShortcut>
                      {action.shortcut.split(" ").map((k) => (
                        <kbd
                          key={k}
                          className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
