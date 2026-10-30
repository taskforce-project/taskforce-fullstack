---
title: Introduction
subtitle: The TaskForce REST API, in short.
---

Everything the app does goes through a REST API described in OpenAPI 3.1. The API reference, at the end of this
menu, is generated from that description, and the guides of this section give the rules that apply to every endpoint.

## Base address

The API of an instance is served at its API address followed by `/api`. On the hosted TaskForce, whose web app is
`https://app.taskforce-project.fr`, that is `https://api.taskforce-project.fr/api`. On a self-hosted instance with the
default settings, that is `http://localhost:8080/api` (`TF_API_URL` in `.env`).

Requests and responses are JSON. There is no version in the path: the OpenAPI description of the release you run is
the contract.

Most paths start with the workspace's slug, then the resource:

```
/api/workspaces/{slug}/projects/{projectId}/issues/{issueId}
```

## Responses

A successful response wraps its payload in an envelope, and the payload is in `data`:

```json
{
  "success": true,
  "message": "Issue created",
  "data": { "id": 42, "identifier": "WEB-42", "title": "Fix login" },
  "timestamp": "2026-10-19T14:12:00"
}
```

Errors are described in [Conventions](/api/api-conventions).

## A first call

```bash
curl -X POST http://localhost:8080/api/workspaces/acme/projects/12/issues \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix login", "priority": "HIGH" }'
```

The access token comes from signing in: see [Authentication](/api/api-authentication).

## The OpenAPI description

The description is in the repository, at
[`fern/openapi/openapi.json`](https://github.com/taskforce-project/taskforce-fullstack/blob/main/fern/openapi/openapi.json).
Give it to a client generator or to Postman, Insomnia or Bruno rather than writing each call by hand.

<CardGroup cols={2}>
  <Card title="Authentication" icon="key" href="/api/api-authentication">
    Sign in, send the token, refresh it.
  </Card>
  <Card title="Conventions" icon="list-check" href="/api/api-conventions">
    Errors, pagination, rate limits, dates.
  </Card>
  <Card title="Webhooks" icon="bolt" href="/api/api-webhooks">
    Receive events and check their signature.
  </Card>
  <Card title="MCP server" icon="robot" href="/api/api-mcp">
    Work on your issues from Claude Code.
  </Card>
</CardGroup>
