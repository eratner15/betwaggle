# Backend Runbook: Email Capture + Resend Drip Trigger

## Required Worker Secrets

Set these in Cloudflare Workers (never in code):

```bash
cd /home/eratner/betwaggle
source ~/.nvm/nvm.sh
nvm use 20

npx wrangler secret put RESEND_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

## /api/email-capture Behavior

- Endpoint persists capture data to KV (`email:<normalized_email>`) and attempts D1 upsert into `email_captures`.
- Welcome drip trigger is idempotent per normalized email over a 24-hour suppression window.
- Suppression key: `email-drip:capture:<normalized_email>` (TTL: 86400 seconds).
- Trigger logs include:
  - `requestId`
  - SHA-256 `emailHash`
  - downstream `resendStatus`

## Verification Steps (Post-Deploy)

1. Submit first capture:

```bash
curl -i -X POST https://betwaggle.com/api/email-capture \
  -H 'Content-Type: application/json' \
  -d '{"email":"test+capture@betwaggle.com","source":"pricing","source_page":"/pricing/"}'
```

Expected:
- HTTP `200`
- JSON includes `ok: true`
- JSON includes `drip.queued: true` or `drip.suppressed: false`
- JSON includes `requestId` and `emailHash`

2. Submit the same email again within 24h.

Expected:
- HTTP `200`
- JSON includes `drip.suppressed: true`

3. Confirm worker logs:
- `email_capture_drip_triggered` with `requestId`, `emailHash`, `resendStatus`
- No repeated `email_capture_drip_triggered` for same email within suppression window

4. Negative checks:
- Invalid email returns `400` with structured `code`
- Missing `RESEND_API_KEY` returns `503` with structured `code`
- Rate limit (`>5/min/IP`) returns `429`
