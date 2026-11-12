"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { RuleLayer, RuleScope, RulesOverview } from "@/lib/api/rules-service"
import { dayOf, fill, layerTitle, ruleSentence, type RulesTexts } from "@/lib/rules/rule-words"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useRulesStore } from "@/lib/store/rules-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { AddRuleDialog } from "./add-rule-dialog"
import { RuleRow } from "./rule-row"
import { RuleTester } from "./rule-tester"

/** Une couche à montrer : celle du serveur, ou une couche encore vide où la personne peut écrire. */
interface Group {
  key: string
  title: string
  hint?: string
  layer: Pick<RuleLayer, "scope" | "ref" | "canEdit" | "rules">
}

const empty = (scope: RuleScope, ref: string | null, canEdit: boolean): Group["layer"] => ({ scope, ref, canEdit, rules: [] })

/** Les couches de l'écran, dans l'ordre où on les lit : la plus large d'abord, puis les rôles, les personnes, les projets. */
function groupsOf(overview: RulesOverview, t: RulesTexts, projectId?: number): Group[] {
  const find = (scope: RuleScope, ref: string | null) => overview.layers.find((l) => l.scope === scope && l.ref === ref)
  if (projectId !== undefined) {
    const ref = String(projectId)
    const canEdit = overview.projects.find((p) => p.id === projectId)?.canEdit ?? false
    const own = find("project", ref)
    const workspace = find("workspace", null)
    const groups: Group[] = [{ key: `project:${ref}`, title: t.thisProject, layer: own ?? empty("project", ref, canEdit) }]
    if (workspace && workspace.rules.length > 0) {
      groups.push({ key: "workspace", title: t.inheritedTitle, hint: t.inheritedHint, layer: { ...workspace, canEdit: false } })
    }
    return groups
  }
  const order: RuleScope[] = ["workspace", "role", "person", "process", "project"]
  const groups: Group[] = [{
    key: "workspace", title: t.workspaceLayer, layer: find("workspace", null) ?? empty("workspace", null, overview.canEdit),
  }]
  const others = overview.layers.filter((l) => l.scope !== "workspace" && l.rules.length > 0)
    .sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope))
  for (const layer of others) {
    groups.push({ key: `${layer.scope}:${layer.ref ?? ""}`, title: layerTitle(layer, t), layer })
  }
  return groups
}

/**
 * Settings > Rules et Project settings > Rules (R157) : les règles en phrases, par couche, avec qui a écrit chacune et
 * quand ; au-dessus, ce que TaskForce garantit toujours ; « Add a rule » ; « What would happen? » ; la table de TaskForce
 * et l'histoire des versions, repliées. Jamais le format des règles en premier : il est à deux clics.
 */
export function RulesPanel({ projectId, slug: given }: Readonly<{ projectId?: number; slug?: string }>) {
  const t = usePreferencesStore((s) => s.t.rules)
  const active = useWorkspaceStore((s) => s.activeWorkspace?.slug ?? "")
  const slug = given ?? active
  const overview = useRulesStore((s) => (s.slug === slug ? s.overview : null))
  const loadFailed = useRulesStore((s) => s.loadFailed)
  const fetchRules = useRulesStore((s) => s.fetchRules)
  const removeRule = useRulesStore((s) => s.removeRule)
  const [adding, setAdding] = useState(false)
  const [showDefaults, setShowDefaults] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (slug) void fetchRules(slug)
  }, [slug, fetchRules])

  const groups = useMemo(() => (overview ? groupsOf(overview, t, projectId) : []), [overview, t, projectId])
  const canAdd = groups[0]?.layer.canEdit ?? false

  if (!overview) {
    return loadFailed ? (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{t.loadFailed}</p>
        <Button variant="outline" size="sm" onClick={() => void fetchRules(slug)}>{t.retry}</Button>
      </div>
    ) : (
      <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t.title} /></div>
    )
  }

  async function remove(scope: RuleScope, ref: string | null, group: string): Promise<boolean> {
    const ok = await removeRule(slug, scope, ref, group)
    if (ok) toast.success(t.removed)
    else toast.error(useRulesStore.getState().error ?? t.loadFailed)
    return ok
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{projectId !== undefined ? t.projectIntro : t.intro}</p>
      </div>

      <section aria-labelledby="rules-floor" className="flex flex-col gap-1.5">
        <h4 id="rules-floor" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.floorTitle}</h4>
        <ul className="flex flex-col gap-1">
          {overview.floor.map((id) => (
            <li key={id} className="text-sm text-foreground">{id in t.floor ? t.floor[id as keyof RulesTexts["floor"]] : id}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t.floorRecorded}</p>
      </section>

      {groups.map((group) => (
        <section key={group.key} aria-label={group.title} className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h4>
          {group.hint && <p className="text-xs text-muted-foreground">{group.hint}</p>}
          {group.layer.rules.length === 0 ? (
            <p className="py-1 text-sm text-muted-foreground">{t.noRules}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {group.layer.rules.map((statement) => (
                <RuleRow key={statement.group} statement={statement} t={t} canEdit={group.layer.canEdit}
                  onRemove={() => remove(group.layer.scope, group.layer.ref, statement.group)} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <div className="flex flex-col items-start gap-1.5">
        {canAdd ? (
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" />{t.addRule}</Button>
        ) : (
          <p className="text-xs text-muted-foreground">{projectId !== undefined ? t.readOnlyProject : t.readOnly}</p>
        )}
      </div>

      <section aria-labelledby="rules-tester" className="flex flex-col gap-1.5">
        <h4 id="rules-tester" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.tester.title}</h4>
        <RuleTester slug={slug} projectId={projectId ?? null} t={t} />
      </section>

      <section className="flex flex-col gap-1.5">
        <button type="button" className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={showDefaults} onClick={() => setShowDefaults((v) => !v)}>
          {showDefaults ? t.defaultsHide : fill(t.defaultsShow, { count: overview.defaults.length })}
        </button>
        {showDefaults && (
          <ul className="flex flex-col gap-1.5" aria-label={t.defaultsTitle}>
            {overview.defaults.map((rule) => (
              <li key={rule.id} className="flex flex-col">
                <span className="text-sm text-foreground">{ruleSentence(rule, t, {}, "agent")}</span>
                <span className="text-xs text-muted-foreground">{rule.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview.versions.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <button type="button" className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t.historyHide : t.historyShow}
          </button>
          {showHistory && (
            <ul className="flex flex-col gap-1">
              {overview.versions.map((v) => (
                <li key={v.version} className="flex flex-col text-xs">
                  <span className="text-foreground">
                    {fill(t.historyRow, { version: v.version, layer: layerTitle(v, t), who: v.author ?? "", date: dayOf(v.at) })}
                    {" · "}{v.rules === 1 ? t.historyRule : fill(t.historyRules, { count: v.rules })}
                  </span>
                  {v.digest && (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.digest}</summary>
                      <code className="break-all font-mono text-[11px] text-muted-foreground">{v.digest}</code>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AddRuleDialog open={adding} onOpenChange={setAdding} slug={slug} projectId={projectId} members={overview.members} />
    </div>
  )
}
