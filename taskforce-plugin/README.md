# TaskForce plugin for Claude Code (interactive mode)

Work on your TaskForce issues **in your own Claude Code**. Run `/taskforce`: the plugin lists the issues assigned to
you, you pick one, Claude works on it with you (code or writing) and leaves a comment on the issue. Everything goes
through the **MCP server of your TaskForce instance**, as you, with your rights.

It is the interactive counterpart of the local runner (`taskforce-runner/`):

| | Local runner (`taskforce-runner`) | This plugin |
|---|---|---|
| Mode | Autonomous: you delegate in the app, it works in the background, opens a pull request | Interactive: you open Claude Code, take an issue, and watch |
| Process | A small daemon on your machine | Nothing more: your Claude Code session |
| Identity | The runner's service account, acting for you in a delegated session | **You** (your personal access token) |
| Delivery | Pull request | A comment on the issue (and local code if you opened the repository) |

## Requirements

- Claude Code installed (`claude`).
- A **personal access token**: in TaskForce, **Settings > Agents > Claude Code in your terminal**, create a token. It
  starts with `tfp_`, acts as you, only works with the MCP server, and can be revoked there at any time.

## Install

1. Add this folder as a marketplace, then install the plugin (from Claude Code):

   ```
   /plugin marketplace add <path to taskforce-fullstack>/taskforce-plugin
   /plugin install taskforce@taskforce
   ```

2. When the plugin is enabled, Claude Code asks for its settings:
   - **TaskForce API address**: `https://api.taskforce-project.fr` by default (`http://localhost:8080` for a local
     instance), without `/api`.
   - **Workspace**: the slug in the address of the app (e.g. `acme`).
   - **Personal access token**: the `tfp_...` token. Claude Code stores it as a sensitive value.

3. Run `/taskforce` (or `/taskforce WEB-28` for a given issue).

## Without the plugin

The MCP server is a plain Streamable HTTP endpoint, so any MCP client can use it. With Claude Code alone:

```bash
claude mcp add --transport http taskforce https://api.taskforce-project.fr/api/workspaces/<workspace>/mcp --header "Authorization: Bearer <token>"
```

TaskForce shows this exact command when you create a token.

## What it can do

The tools of the MCP server: read an issue and its thread, search the Brain OS, list your issues and the projects,
comment, create or update an issue, get an assignee recommendation, ask Cortex. All of them **with your rights**.
The `/taskforce` command frames the work: context first, then the task, then a summary as a comment. The text of
issues is treated as data, never as instructions.
