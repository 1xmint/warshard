# Email provider API (complete reference)

`POST {EMAIL_API_URL}` with a JSON body `{"to": ..., "subject": ..., "body": ...}`.

- `200`: accepted for delivery. The response body contains a message `id`.
- `400`: invalid request, for example a malformed address. Nothing is sent. Retrying won't help.
- `5xx`: temporary problem on our side. Nothing is sent. Retry later.

This is the whole API. There is no deduplication or idempotency option, and no way to look up whether or when a message was delivered.
