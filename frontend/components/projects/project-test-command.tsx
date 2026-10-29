"use client"

import { useState } from "react"
import { FlaskConical, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProjectStore } from "@/lib/store/project-store"

/**
 * La commande de test du projet (S1, R32) : TaskForce la lance après le travail d'un agent, sur l'ordinateur de la
 * personne qui a délégué, qui l'accepte d'abord. L'agent, lui, ne lance plus les scripts du dépôt. Vide : aucun test.
 */
export function ProjectTestCommand({ workspace, projectId }: Readonly<{ workspace: string; projectId: number }>) {
  const saved = useProjectStore((s) => (s.activeProject?.id === projectId ? s.activeProject.testCommand ?? "" : ""))
  const setTestCommand = useProjectStore((s) => s.setTestCommand)
  const [value, setValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  const changed = value.trim() !== saved

  async function save() {
    setSaving(true)
    const ok = await setTestCommand(workspace, projectId, value.trim())
    setSaving(false)
    if (ok) toast.success(value.trim() ? "Test command saved" : "No tests will run after an agent's work")
    else toast.error(useProjectStore.getState().error ?? "Couldn't save the test command")
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`test-command-${projectId}`} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <FlaskConical className="size-3.5 text-muted-foreground" /> Tests after an agent&apos;s work
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`test-command-${projectId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="npm test"
          className="h-8 font-mono text-xs"
          maxLength={500}
        />
        <Button size="sm" className="h-8" disabled={!changed || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        TaskForce runs this command once the agent is done, on the computer of the person who delegated, who accepts it
        first. The agent itself doesn&apos;t run the repository&apos;s scripts. Leave it empty to run no tests.
      </p>
    </div>
  )
}
