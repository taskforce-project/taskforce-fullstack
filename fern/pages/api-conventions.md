---
title: Conventions
subtitle: Errors, pagination, rate limits and formats, for every endpoint.
---

## Methods

| Method | Use |
| --- | --- |
| **GET** | Read a resource or a list, without side effects. |
| **POST** | Create a resource, or run an action. |
| **PUT** / **PATCH** | Change a resource. |
| **DELETE** | Delete a resource. |

Most creations return `201`, other successes `200`.

## Errors

Read the HTTP status first. The body of an error has a `message` that says what went wrong, in one of two shapes.

Most errors, validation included:

```json
{
  "status": 400,
  "error": "Validation Error",
  "message": "Invalid input data",
  "path": "/api/workspaces/acme/projects/12/issues",
  "timestamp": "2026-10-19T14:12:00",
  "validationErrors": { "title": ["The title is required"] }
}
```

`validationErrors` lists, for each invalid field, what is wrong with it. Some endpoints, sign-in among them, answer
with the envelope of successful responses instead, with `"success": false`, the reason in `message` and
`"data": null`.

| Code | When |
| --- | --- |
| **400** | Invalid body or parameters, or a request the current state does not allow. |
| **401** | Not signed in, or the token expired. See [Authentication](/api/api-authentication). |
| **403** | Signed in, but the role does not allow the action. |
| **404** | The resource does not exist, or is not visible to this account. |
| **409** | A conflict with the current state, such as a duplicate. |
| **413** | The uploaded file is too large. |
| **429** | Too many requests: see below. |
| **5xx** | A server error. Retry later; the instance's logs say more. |

## Pagination

Lists return all their items at once, except the issues of a project, which can also be read page by page with
`GET /api/workspaces/{slug}/projects/{projectId}/issues/paged`. It takes `page` (from `0`) and `size` (default `30`,
at most `100`), and returns a page in `data`:

```json
{
  "content": [],
  "pageNumber": 0,
  "pageSize": 30,
  "totalElements": 128,
  "totalPages": 5,
  "first": true,
  "last": false,
  "empty": false
}
```

Read the next pages until `last` is `true`.

## Rate limits

Each IP address has a budget per minute:

| Requests | Per minute |
| --- | --- |
| Sign-in, sign-up, password reset and verification codes | 10 |
| Token refresh | 20 |
| AI assistant and Smart Assign | 20 |
| Everything else | 200 |

Each response carries `X-RateLimit-Remaining`. Past the limit, the API answers `429` with `Retry-After`, the number
of seconds to wait, and a short body:

```json
{ "error": "Too Many Requests", "message": "Rate limit reached. Retry in 12s.", "retryAfterSeconds": 12 }
```

Wait for `Retry-After` before retrying, and back off when you retry several times.

AI features also share a budget per minute across the instance (`429` with `Retry-After`), and the instance may
cap each workspace owner's AI use per month: past that cap, AI calls return `409` until the first day of next month.

## Formats

- **Identifiers** are numbers (`projectId`, `issueId`). Issues also have a readable identifier made of the project's
  key and a number (`WEB-42`).
- **Dates** are ISO 8601. Date-times are in UTC, written without a time zone (`2026-10-19T14:12:00`): add the `Z`
  before converting them to local time.
- **Text** in issues, comments and Brain OS pages is Markdown.

## Good habits

- Make your calls safe to repeat: after a network error or a `429`, the same call may run twice.
- Generate a client from the OpenAPI description rather than writing each call by hand: contract changes then show up
  when you regenerate it.
