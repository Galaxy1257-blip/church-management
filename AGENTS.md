# ChMS — agent instructions

## Legal documents stay current

`apps/web/src/app/(public)/terms/page.tsx` and `.../privacy/page.tsx` are the public
Terms of Use and Privacy Policy. Their operator/contact/revision date live in
`apps/web/src/app/(public)/legal-meta.ts` (one source of truth).

When any change alters **what the app stores**, **who processes it** (new third-party
provider, new payment/SMS/messaging integration), or **how a person can delete their
data**, update the two pages in the same commit and bump `LEGAL_UPDATED`.

The erasure endpoint `DELETE /auth/me` (auth.controller → auth.service `eraseMe`) is a
legal right, not a feature: it must never be gated behind a church App-section switch.
Keep the `auth.erase.spec.ts` guarantees intact — anonymise the person, keep the
amounts, and never write a before/after snapshot into the audit log.
