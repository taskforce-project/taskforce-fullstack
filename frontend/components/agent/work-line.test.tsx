import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import type { AssistantRead, AssistantToolCall } from "@/lib/api/assistant-service"
import { useCortexStore } from "@/lib/store/cortex-store"
import { WorkedLine, WorkingLine } from "./work-line"

const read = (patch: Partial<AssistantRead> = {}): AssistantRead => ({ issues: [], boards: [], tools: [], notes: 0, ...patch })
const call = (name: string, status: string, patch: Partial<AssistantToolCall> = {}): AssistantToolCall =>
  ({ name, status, input: '{"project":"SOLO"}', output: "20 issues", ...patch })

describe("WorkingLine : une ligne calme dit ce qui se passe (R137)", () => {
  beforeEach(() => useCortexStore.setState({ workStep: null }))

  it("avant la première étape : « Working… », jamais une phase inventée", () => {
    render(<WorkingLine />)

    expect(screen.getByRole("status")).toHaveTextContent(/^Working…$/)
  })

  it("dit l'étape que le serveur vient d'annoncer, sans nom d'outil", () => {
    useCortexStore.setState({ workStep: { conversationId: 1, step: "tool", tool: "create_issue" } })
    render(<WorkingLine />)

    expect(screen.getByRole("status")).toHaveTextContent("Working… Preparing the issue")
    expect(screen.getByRole("status")).not.toHaveTextContent("create_issue")
  })
})

describe("WorkedLine : la réponse replie son travail (R137)", () => {
  it("une réponse qui n'a rien fait d'autre ne montre rien ici", () => {
    const { container } = render(<WorkedLine answer={{ toolCalls: [], read: read({ notes: 5 }), reasoning: null }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("« Worked for 8 s » et un chevron ; dépliée, des phrases, jamais un nom d'outil", () => {
    render(<WorkedLine answer={{ toolCalls: [call("delete_issue", "pending", { target: { issueId: 1, projectId: 1, key: "SOLO-135", title: "x" } })], read: read({ notes: 5, workedMs: 8000 }), reasoning: null }} />)

    const line = screen.getByRole("button", { name: "Worked for 8 s" })
    expect(line).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Read 5 notes")).not.toBeInTheDocument()

    fireEvent.click(line)

    expect(line).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Read 5 notes")).toBeInTheDocument()
    expect(screen.getByText("Asked before deleting SOLO-135")).toBeInTheDocument()
    expect(screen.queryByText(/delete_issue/)).not.toBeInTheDocument()
  })

  it("le brut est un clic plus loin", () => {
    render(<WorkedLine answer={{ toolCalls: [call("list_issues", "success")], read: read({ workedMs: 3000 }), reasoning: null }} />)
    fireEvent.click(screen.getByRole("button", { name: "Worked for 3 s" }))

    expect(screen.queryByText("20 issues")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Read the issues of the board/ }))

    expect(screen.getByText("What was asked")).toBeInTheDocument()
    expect(screen.getByText('{"project":"SOLO"}')).toBeInTheDocument()
    expect(screen.getByText("20 issues")).toBeInTheDocument()
  })

  it("rouverte, elle se relit sans le brut", () => {
    render(<WorkedLine answer={{ toolCalls: [], read: read({ acts: [{ name: "add_comment", status: "success", key: "TF-12" }] }), reasoning: null }} />)
    fireEvent.click(screen.getByRole("button", { name: "Worked" }))

    expect(screen.getByText("Commented on TF-12")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Commented on TF-12/ })).not.toBeInTheDocument()
  })

  it("le raisonnement, s'il y en a un, reste dans le pli", () => {
    render(<WorkedLine answer={{ toolCalls: [call("list_issues", "success")], read: read(), reasoning: "Because." }} />)
    expect(screen.queryByText("Reasoning")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Worked" }))

    expect(screen.getByText("Reasoning")).toBeInTheDocument()
  })
})
