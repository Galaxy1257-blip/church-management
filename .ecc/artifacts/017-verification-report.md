# Verification Report — Full-Stack Audit Fixes & Compact Sidebar Utility Bar

**Date:** 2026-11-28  
**Plan:** `015-implementation-plan.md`

## Changes Verified

1. **Portal OTP SMS dispatch** (`apps/api/src/portal/portal.module.ts`): Routed through `SmsDispatcher` (`dispatch` + `flush`) and imported `SmsModule`.
2. **Counseling colleague sharing** (`apps/api/src/ministry/care.module.ts`, `apps/web/src/app/(app)/counseling/page.tsx`): Added `GET /counseling/colleagues` returning active staff `User.id`s and replaced the raw member-ID text input with a staff colleague checkbox picker.
3. **WhatsApp module guard** (`apps/api/src/ministry/whatsapp.module.ts`): Added `@ForModule('reach')` on `WhatsAppController`.
4. **Shared `MemberPicker` & UI fixes**:
   - Created `apps/web/src/components/member-picker.tsx`
   - Wired into `roster/page.tsx` (plus `GET /groups` selector & `groupId` in `POST /roster`), `campaigns/page.tsx`, `org/page.tsx` (plus `POST /households/:id/link` UI), and `care/page.tsx`.
5. **Scheduled SMS campaigns**:
   - Added `apps/worker/src/sms-campaigns.ts` (`processScheduledSmsCampaigns` with quiet-hours deferral, atomic `SCHEDULED -> SENDING` claim, chunked wallet reservation, `SmsLog`/`SmsLedger` creation, and `smsSend` enqueue).
   - Wired `'campaign-schedule'` into `apps/worker/src/maintenance.ts` and `apps/worker/src/main.ts` (`* * * * *`).
   - Added optional `datetime-local` scheduling to `apps/web/src/app/(app)/sms/page.tsx`.
6. **Compact adjustable sidebar utility bar**:
   - Updated `apps/web/src/components/app-nav.tsx` and `apps/web/src/app/globals.css` to replace the 5 stacked text links (`Usher mode`, `About`, `Share links`, `Help`, `Log out`) with a compact single-row `lucide-react` icon bar + position toggle (`ArrowUp`/`ArrowDown`) persisted to `localStorage` (`chms.sideFootPos`: `'bottom'` or `'top'`).
7. **Environment docs**: Documented `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `TURNSTILE_SECRET_KEY` in `.env.example`.

## Residual Risks

- `apps/api/prisma/extras.sql` contains `audit_event` RLS, which must still be applied to any live Postgres database where `relrowsecurity` is false.
- Login/auth flows and Paystack payment integration were intentionally left untouched as WIP per user instruction.
