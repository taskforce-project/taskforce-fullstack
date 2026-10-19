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

## Usage

AI use counts against the owner of each workspace, for all their workspaces. **Settings > Cortex usage** shows the
current month: tokens, requests and the cap, if the instance sets one (`AI_MONTHLY_TOKENS_PER_ACCOUNT`).
