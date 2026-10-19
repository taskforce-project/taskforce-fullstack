---
title: MCP server
subtitle: Work on your TaskForce issues from Claude Code or any MCP client.
---

Each workspace is an MCP server. Claude Code, or any client that speaks MCP over HTTP, connects to it with a personal
access token and can then read the workspace, search its Brain OS and work on its issues, as you.

## Connect Claude Code

1. In TaskForce, open **Settings > Agents > Claude Code in your terminal** and create a token. Choose how long it lasts:
   30 days, 90 days, a year, or no expiration.
2. Copy the command shown with the token, which looks like this, and run it in your terminal:

   ```bash
   claude mcp add --transport http taskforce http://localhost:8080/api/workspaces/acme/mcp \
     --header "Authorization: Bearer tfp_..."
   ```

3. In Claude Code, ask for your issues: "list my TaskForce issues", "read WEB-42 and fix it".

The token is shown once. It acts as you, with your rights, and only on the MCP server: the rest of the API refuses it.
You can have up to 20 active tokens, and revoke each one in the same place.

## The endpoint

```
POST <TF_API_URL>/api/workspaces/{slug}/mcp
Authorization: Bearer tfp_...
```

The server uses the Streamable HTTP transport without sessions: every message is a JSON-RPC 2.0 `POST`, and `GET` and
`DELETE` answer `405`. Its answers are JSON-RPC messages, not the `ApiResponse` envelope of the REST API.

## Tools

| Tool | What it does |
| --- | --- |
| `list_projects` | Lists the workspace's projects. |
| `list_issues` | Lists the issues of a project. |
| `get_issue` | Reads one issue with its description and comments. |
| `list_issue_statuses` | Lists a project's statuses, to change an issue's status. |
| `list_my_issues` | Lists the issues assigned to you. |
| `workspace_kpis` | Resolved issues, velocity, work in progress and issues at risk. |
| `brain_search` | Searches the Brain OS notes. |
| `create_issue` | Creates an issue. |
| `update_issue` | Changes an issue's status, assignee, priority, title, description or due date. |
| `add_comment` | Comments on an issue, in Markdown. |
| `smart_assign` | Recommends an assignee, with the reasons, without assigning. |
| `ask_cortex` | Asks Cortex, which answers from the Brain OS and the projects. |

The tools act with your rights: a project you cannot see stays invisible, and a change you are not allowed to make is
refused.

When you delegate an issue to Claude Code through the [local runner](/guides/coding-agents), the agent uses this same
server, with a session limited to the run.
