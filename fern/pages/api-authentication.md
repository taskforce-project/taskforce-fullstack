---
title: Authentication
subtitle: Sign in with a TaskForce account, then send the access token on each request.
---

The REST API acts as a TaskForce account, with that account's rights. You sign in with the account's email and
password, and the API returns a short-lived access token (a JWT) to send in the `Authorization` header.

## Sign in

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "ada@example.com", "password": "..." }'
```

```json
{
  "success": true,
  "message": "Signed in",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "tokenType": "Bearer",
    "expiresIn": 1800,
    "user": { "id": 7, "email": "ada@example.com" }
  },
  "timestamp": "2026-10-19T14:12:00"
}
```

`expiresIn` is the token's lifetime in seconds (30 minutes on a default self-hosted instance). Wrong credentials
return `401`.

**Two-factor sign-in.** When the account has two-factor sign-in turned on, the first call returns
`"twoFactorRequired": true` and no token. Send the same request again with the current code of the authenticator app
in `totp`.

## Send the token

```bash
curl http://localhost:8080/api/workspaces/acme/projects \
  -H "Authorization: Bearer <access_token>"
```

## Refresh it

The refresh token is not in the response body: it comes as an `HttpOnly` cookie, `tf_refresh`, valid for 3 hours. To
get a new access token before the current one expires, call the refresh endpoint with that cookie:

```bash
curl -X POST http://localhost:8080/api/auth/refresh-token -b cookies.txt -c cookies.txt
```

The response has the same shape as the sign-in response, and replaces the cookie. When the refresh token has expired,
the call returns `401`: sign in again.

## Sign out

`POST /api/auth/logout` with the access token revokes the account's refresh tokens.

## Personal access tokens

Personal access tokens (`tfp_...`) only work on the [MCP server](/api/api-mcp). On any other path they are refused
with `403`.

## Limits

Sign-in is limited to 10 attempts per minute and per IP address, and refreshing to 20 per minute. See
[Conventions](/api/api-conventions#rate-limits).

| Code | Meaning |
| --- | --- |
| **401** | No token, an invalid or expired token, or wrong credentials. |
| **403** | The account is signed in but its role does not allow the action. |

<Warning>
  Never put an account's password or refresh token in a public client, such as a web page or a mobile app. Beyond a
  trusted network, call the API over HTTPS.
</Warning>
