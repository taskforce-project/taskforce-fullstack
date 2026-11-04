---
title: AI
subtitle: Cortex, issue drafting and Smart Assign, with the model you choose.
---

TaskForce works without AI. With a model configured, Cortex answers questions and drafts issues, search understands
meaning, and Smart Assign weighs more than its rules.

## Cortex

Cortex is the workspace's assistant. It answers from the Brain OS and the workspace's projects, and shows the notes it
relied on. It also drafts the specification of an issue from its title and context, and you approve the draft before
it is saved to the issue.

Cortex can use the tools of the MCP servers connected to the workspace (see [Integrations](/guides/integrations)):
reading runs directly, and a change waits for the approval of an owner or an admin.

## Smart Assign

Smart Assign suggests the best person for an issue from skills, workload and history, and says why. Without AI it uses
these rules alone; with AI, a model also scores how well the issue matches each person. Either way it is a
suggestion: you apply it yourself.

## Search

The Brain OS search works on plain text. With an AI model for search (`bge-m3` with Ollama, by default), it also finds
notes by meaning.

## Choose the model

AI comes from Ollama on the same machine by default (`qwen3:8b` for answers, `bge-m3` for search), or from any
OpenAI-compatible API (OpenAI, Groq, Mistral, a vLLM server...). The setup is in
[Self-hosting](/guides/self-hosting#ai).

## What each model can do

**Settings > AI** lists the chat models the instance serves and what each one can do, measured here by eight fixed test
cases, never taken from the vendor: using TaskForce's tools, holding a long document, reading code, answering in French
and in English. **Measure** replays the cases on a model, one by one, with Cortex's prompt and tools, and counts in your
AI usage. TaskForce proposes the first model that passes the cases of each kind; **Use for Cortex** makes Cortex answer
you with the model you pick. In the desktop app, it fills the computer's AI settings, which you save.

When the test cases say that Cortex's model fails the kind of request you just made, and another served model does
better, TaskForce says so under the answer. **Ask** sends the same request to that model; TaskForce never switches
models on its own.

## Usage

AI use counts against the owner of each workspace, for all their workspaces. **Settings > Cortex usage** shows the
current month: tokens, requests and the cap, if the instance sets one (`AI_MONTHLY_TOKENS_PER_ACCOUNT`).
