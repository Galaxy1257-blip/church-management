# Incident response

## First 15 minutes

1. Name an incident lead and open a private timeline with UTC timestamps.
2. Preserve API, worker, hosting, database, and provider logs. Do not paste payloads,
   phone numbers, tokens, passwords, OTPs, or full payment responses into chat.
3. Contain the affected path: pause the church's SMS or push sends, disable public
   giving if money is at risk, and stop the worker when queue payloads are suspect.
4. For suspected account takeover, revoke refresh-token families and require a
   password reset. Notify affected users through a verified channel.
5. For suspected key exposure, rotate the key at its provider and in every runtime
   environment. A code change is not rotation.

## Triage

- **Authentication:** inspect refresh-token reuse, OTP failures, login velocity,
  role changes, and new devices. Revoke sessions before rotating JWT secrets.
- **Money:** freeze settlement or payouts, compare gateway totals with local
  transaction references, preserve webhook IDs, and reconcile before reopening.
- **SMS/push:** pause sends, check opt-outs and spend, remove malicious subscriptions,
  and confirm that queued jobs cannot replay after the provider is re-enabled.
- **Tenant/data:** isolate the affected church, preserve RLS and audit evidence,
  and use a tested Neon branch or backup for forensic queries. Never bypass RLS
  in the application to make an incident disappear.
- **Web:** disable the affected route or deployment, retain response headers and
  CSP reports, and rotate any browser-exposed secret immediately.

## Recovery

1. Patch the root cause and add a regression test that fails before the fix.
2. Reconcile money, message, and queue ledgers; document every manual correction.
3. Restore service gradually and monitor errors, 401/403/429 rates, queue failures,
   audit-chain verification, and provider spend.
4. Confirm `DELETE /auth/me` still works and was never feature-gated.
5. Write a short post-incident review: trigger, blast radius, detection gap,
   corrective actions, owners, and dates. Update legal pages if data handling or
   processors changed.

## Provider controls to verify

- Vercel deployment protection, environment scoping, firewall/rate limits, and alerts.
- Neon PITR, restore drills, least-privilege roles, IP allowlist where available.
- Redis ACL/password, TLS/private networking, queue retention, and spend alerts.
- Paystack and SMS test/live separation, webhook secrets, IP controls where offered,
  budget limits, and incident contacts.
- DNS SPF/DKIM/DMARC and stale CNAME review.
