"use client"

import { useId, useState, type ReactNode } from "react"
import { CornerDownLeft, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { AssistantChoice, AssistantQuestion, AssistantToolCall } from "@/lib/api/assistant-service"
import {
  OTHER, answersOf, initialPicks, pick, saidOf, toggle, typeIn, type Picked,
} from "@/lib/cortex/question-card"
import { fillText } from "@/lib/delivery/result-card"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * La carte des questions de Cortex avant un geste (R115, R136 : une seule voix), dans la forme des questions de Claude (décision
 * du CEO, 05/11/2026) : deux questions au plus, chacune avec son titre court, ses choix et ce qu'ils veulent dire en une
 * ligne, le recommandé en premier, marqué et coché d'avance, des cases à cocher quand les réponses ne s'excluent pas,
 * « Other » pour taper sa réponse, et un seul envoi pour la carte. Les réponses partent au serveur, qui reprend le geste
 * sans le modèle ; la suite (d'autres questions, la carte du geste, ce qu'il a fait) s'affiche ici, par `then`. La carte
 * garde son cadre, comme les autres cartes de la conversation, qui n'en a pas.
 */
export function QuestionCard({ slug, call, then }: Readonly<{
  slug: string
  call: AssistantToolCall & { questions: AssistantQuestion[] }
  /** Ce que la conversation montre de la suite du geste. */
  then: (next: AssistantToolCall) => ReactNode
}>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const answerQuestion = useCortexStore((s) => s.answerQuestion)
  const [picks, setPicks] = useState<Record<string, Picked>>(() => initialPicks(call.questions))
  const [sending, setSending] = useState(false)
  const [said, setSaid] = useState("")
  const [next, setNext] = useState<AssistantToolCall | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Envoyer n'est possible que quand chaque question a sa réponse.
  const answers = answersOf(call.questions, picks)

  async function send() {
    if (!answers || sending) return
    setSending(true)
    setProblem(null)
    const result = await answerQuestion(slug, call, answers)
    setSending(false)
    if (result) {
      setSaid(saidOf(call.questions, answers))
      setNext(result)
    } else {
      setProblem(useCortexStore.getState().questionProblem ?? "")
    }
  }

  if (next) {
    return (
      <div className="my-2 flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {fillText(call.questions.length > 1 ? t.questionAnswers : t.questionAnswered, { value: said })}
        </p>
        {then(next)}
      </div>
    )
  }

  return (
    <form
      aria-label={t.questionCard}
      className="my-2 flex flex-col gap-3 border border-border p-2.5 text-xs"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      {call.questions.map((question) => (
        <QuestionField
          key={question.field}
          question={question}
          picked={picks[question.field]}
          disabled={sending}
          onChange={(picked) => setPicks((all) => ({ ...all, [question.field]: picked }))}
        />
      ))}
      {problem !== null && (
        <p role="alert" className="whitespace-pre-wrap break-words text-destructive">
          {fillText(t.questionFailed, { why: problem })}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" className="h-7 px-2.5 text-[11px]" disabled={!answers || sending}>
          {sending ? <Loader2 className="size-3 animate-spin" /> : <CornerDownLeft className="size-3" />}
          {sending ? t.questionSending : t.questionSend}
        </Button>
      </div>
    </form>
  )
}

/**
 * Une question de la carte : son titre, la question, puis ses choix, en boutons radio quand un seul se prend, en cases à
 * cocher sinon, et « Other » avec son champ ; une question sans choix n'a que le champ. Les choix se nomment par leur
 * libellé (et « Recommended »), et se décrivent par leur ligne.
 */
function QuestionField({ question, picked, disabled, onChange }: Readonly<{
  question: AssistantQuestion
  picked: Picked
  disabled: boolean
  onChange: (picked: Picked) => void
}>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const id = useId()
  const named = [question.header ? `${id}-header` : null, `${id}-text`].filter(Boolean).join(" ")
  const typed = (
    <Input
      value={picked.typed}
      disabled={disabled}
      onChange={(e) => onChange(typeIn(picked, e.target.value, question.multiple))}
      placeholder={t.questionOtherPlaceholder}
      aria-label={question.choices.length === 0 ? undefined : fillText(t.questionOtherLabel, { question: question.text })}
      aria-labelledby={question.choices.length === 0 ? named : undefined}
      className="h-7 min-w-0 flex-1 text-xs"
    />
  )
  const other = (control: ReactNode) => (
    <div className="flex items-center gap-2 px-2 py-1.5 has-data-[state=checked]:bg-primary/[0.06]">
      {control}
      <label htmlFor={`${id}-other`} id={`${id}-other-label`} className="shrink-0 cursor-pointer font-medium text-foreground">
        {t.questionOther}
      </label>
      {typed}
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        {question.header && (
          <span id={`${id}-header`}
            className="w-fit bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {question.header}
          </span>
        )}
        <p id={`${id}-text`} className="text-[13px] font-medium leading-snug text-foreground">{question.text}</p>
        {question.multiple && <p id={`${id}-hint`} className="text-muted-foreground">{t.questionSeveral}</p>}
      </div>
      {question.choices.length === 0 ? (
        <div className="flex">{typed}</div>
      ) : question.multiple ? (
        <div role="group" aria-labelledby={named} aria-describedby={`${id}-hint`} className="flex flex-col">
          {question.choices.map((choice, i) => (
            <ChoiceRow key={choice.value} id={`${id}-${i}`} choice={choice}>
              <Checkbox
                id={`${id}-${i}`}
                checked={picked.values.includes(choice.value)}
                disabled={disabled}
                onCheckedChange={(on) => onChange(toggle(picked, choice.value, on === true))}
                className="mt-0.5"
                {...choiceAria(`${id}-${i}`, choice)}
              />
            </ChoiceRow>
          ))}
          {other(
            <Checkbox
              id={`${id}-other`}
              checked={picked.other}
              disabled={disabled}
              onCheckedChange={(on) => onChange(toggle(picked, OTHER, on === true))}
              aria-labelledby={`${id}-other-label`}
            />,
          )}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby={named}
          value={picked.other ? OTHER : (picked.values[0] ?? "")}
          onValueChange={(value) => onChange(pick(picked, value))}
          disabled={disabled}
          className="flex flex-col gap-0"
        >
          {question.choices.map((choice, i) => (
            <ChoiceRow key={choice.value} id={`${id}-${i}`} choice={choice}>
              <RadioGroupItem id={`${id}-${i}`} value={choice.value} className="mt-0.5" {...choiceAria(`${id}-${i}`, choice)} />
            </ChoiceRow>
          ))}
          {other(<RadioGroupItem id={`${id}-other`} value={OTHER} aria-labelledby={`${id}-other-label`} />)}
        </RadioGroup>
      )}
    </div>
  )
}

/** Le nom d'un choix (son libellé, et « Recommended » quand il l'est) et sa description (sa ligne), pour un lecteur d'écran. */
function choiceAria(id: string, choice: AssistantChoice) {
  return {
    "aria-labelledby": choice.recommended ? `${id}-label ${id}-recommended` : `${id}-label`,
    "aria-describedby": choice.description ? `${id}-description` : undefined,
  }
}

/** Un choix : sa case, son libellé, « Recommended » s'il l'est, et sa ligne ; toute la rangée se clique. */
function ChoiceRow({ id, choice, children }: Readonly<{ id: string; choice: AssistantChoice; children: ReactNode }>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 px-2 py-1.5 transition-colors hover:bg-muted/60 has-data-[state=checked]:bg-primary/[0.06]"
    >
      {children}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span id={`${id}-label`} className="break-words font-medium text-foreground">{choice.label}</span>
          {choice.recommended && (
            <span id={`${id}-recommended`} className="bg-primary/10 px-1 py-px text-[10px] font-medium text-primary">
              {t.questionRecommended}
            </span>
          )}
        </span>
        {choice.description && (
          <span id={`${id}-description`} className="break-words text-muted-foreground">{choice.description}</span>
        )}
      </span>
    </label>
  )
}
