---
title: Webhooks
subtitle: Receive TaskForce events on your own endpoint, signed and retried.
---

A webhook sends the events of a workspace to an address you choose: n8n, Zapier, Make or your own code. Each event is
a JSON `POST`, signed with the webhook's secret.

## Set one up

Owners and admins manage webhooks in **Settings > Integrations > Webhooks**:

1. **Add webhook** with the receiving address and the events to send (none selected means all events).
2. Copy the **signing secret** (`whsec_...`). It is shown once; **New signing secret** replaces it later.
3. Send a **test** event to check the address, then follow the **recent deliveries** of each webhook.

A webhook can be paused and resumed. On a self-hosted instance, addresses on your own network are refused unless you
set `WEBHOOKS_ALLOW_PRIVATE_NETWORK=true`.

## Events

| Event | `data` |
| --- | --- |
| `issue.created` | `issue`: the issue, as the API returns it |
| `issue.updated` | `issue`: the issue after the change |
| `issue.deleted` | `issue`: `id`, `identifier`, `title`, `projectId` |
| `comment.created` | `comment`: the comment; `issue`: `id`, `identifier`, `title`, `projectId` |
| `cycle.completed` | `cycle`: the completed cycle |
| `ping` | `message`: sent by the test button only |

## The request

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: TaskForce-Webhooks/1.0
X-TaskForce-Event: issue.created
X-TaskForce-Delivery: 5b0e7c1e-0d4f-4d8e-9a59-3f1c2b7f9e10
X-TaskForce-Timestamp: 1792418520
X-TaskForce-Signature: sha256=8f2c...
```

```json
{
  "id": "evt_1f6c4b0e-4a8e-4b8f-9d2e-0c6a1d5e7b21",
  "type": "issue.created",
  "createdAt": "2026-10-19T14:12:00Z",
  "url": "https://taskforce.example.com/acme/projects/12/issues/42",
  "workspace": { "id": 3, "slug": "acme", "name": "Acme" },
  "actor": { "id": 7, "name": "Ada Lovelace" },
  "data": { "issue": { "id": 42, "identifier": "WEB-42", "title": "Fix login" } }
}
```

- `id` identifies the event, and `X-TaskForce-Delivery` the delivery: both stay the same when a delivery is retried.
- `url` opens the issue or the cycle in the app, when there is one.
- `actor` is the person who made the change.

## Check the signature

`X-TaskForce-Signature` is `sha256=` followed by the hexadecimal HMAC-SHA256 of the timestamp, a dot and the raw body,
with the whole secret as key (`whsec_` included). Compute it on the body exactly as received, before parsing it, and
reject old timestamps so that a captured request cannot be replayed later.

In Node.js, with Express:

```js
import crypto from "node:crypto";
import express from "express";

const app = express();
const secret = process.env.TASKFORCE_WEBHOOK_SECRET; // whsec_...

app.post("/taskforce", express.raw({ type: "application/json" }), (req, res) => {
  const timestamp = req.get("X-TaskForce-Timestamp") ?? "";
  const signature = req.get("X-TaskForce-Signature") ?? "";
  const expected = "sha256=" + crypto.createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(req.body)
    .digest("hex");

  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  const valid = signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!fresh || !valid) return res.sendStatus(401);

  const event = JSON.parse(req.body.toString("utf8"));
  res.sendStatus(204); // answer first, then handle event.type in the background
});
```

In Python, with Flask:

```python
import hashlib, hmac, os, time
from flask import Flask, abort, request

app = Flask(__name__)
secret = os.environ["TASKFORCE_WEBHOOK_SECRET"].encode()  # whsec_...

@app.post("/taskforce")
def taskforce():
    timestamp = request.headers.get("X-TaskForce-Timestamp", "")
    signature = request.headers.get("X-TaskForce-Signature", "")
    body = request.get_data()  # raw bytes
    expected = "sha256=" + hmac.new(secret, timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()

    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > 300:
        abort(401)
    if not hmac.compare_digest(signature, expected):
        abort(401)

    event = request.get_json()
    return "", 204  # answer first, then handle event["type"] in the background
```

## Delivery and retries

A delivery succeeds when your endpoint answers with a `2xx` status within 10 seconds. Otherwise TaskForce tries again
after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours, then marks the delivery as failed. The test event is sent
once.

Because of these retries, the same event can arrive more than once: use its `id` to process it only once, answer
quickly, and do the slow work after answering.
